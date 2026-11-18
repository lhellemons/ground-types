/* Drives scripts/publish-release.sh against a stub `gh` that records every
   call. Nothing here touches GitHub: the stub is first on PATH and the script
   runs in a temp directory holding fake tarballs, with an environment that
   inherits only PATH. Runs with `pnpm test`, locally and in CI. */
import { spawnSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { afterEach, describe, expect, it, vi } from 'vitest'

const script = fileURLToPath(
  new URL('../../scripts/publish-release.sh', import.meta.url),
)

/* Prints what `gh` would print after its own --jq filter, driven by env:
   STUB_VIEW     none | error | draft | published | empty | null; `none`
                 reads as a draft once a `release create` has been logged
   STUB_VIEW_LATER  what every `release view` after the first prints, in place
                 of STUB_VIEW
   STUB_ASSET    file served by `release download`; unset fails the download
   STUB_LIST     newline-separated tags `release list` prints, cut to --limit
   STUB_LIST_FAIL  set to make `release list` fail
   STUB_FAIL_WRITE  space-separated `release` subcommands (create, upload,
                 edit) that fail
   Every call is appended to STUB_LOG, one line each, and the GH_TOKEN,
   GH_REPO and HOME it saw to STUB_LOG.env. */
const stub = `#!/usr/bin/env bash
echo "$*" >> "$STUB_LOG"
echo "GH_TOKEN=\${GH_TOKEN-unset} GH_REPO=\${GH_REPO-unset} HOME=\${HOME-unset}" >> "$STUB_LOG.env"
case "$1 $2" in
  "release create" | "release upload" | "release edit")
    case " \${STUB_FAIL_WRITE:-} " in
      *" $2 "*) echo "HTTP 500: stub $2 failure" >&2; exit 1 ;;
    esac ;;
  "release view")
    views=$(( $(cat "$STUB_LOG.views" 2>/dev/null || echo 0) + 1 ))
    echo "$views" > "$STUB_LOG.views"
    view=$STUB_VIEW
    [ "$views" -eq 1 ] || view=\${STUB_VIEW_LATER:-$STUB_VIEW}
    case "$view" in
      none)
        if [[ "$(<"$STUB_LOG")" == *"release create"* ]]; then echo true
        else echo "release not found" >&2; exit 1; fi ;;
      error) echo "HTTP 401: Bad credentials" >&2; exit 1 ;;
      draft) echo true ;;
      published) echo false ;;
      empty) ;;
      null) echo null ;;
    esac ;;
  "release download")
    while [ $# -gt 0 ]; do
      case "$1" in --pattern) pattern=$2 ;; --dir) dir=$2 ;; esac
      shift
    done
    [ -n "\${STUB_ASSET:-}" ] || { echo "no assets match the file pattern" >&2; exit 1; }
    mkdir -p "$dir" && cp "$STUB_ASSET" "$dir/$pattern" ;;
  "release list")
    [ -z "\${STUB_LIST_FAIL:-}" ] || { echo "HTTP 502" >&2; exit 1; }
    while [ $# -gt 0 ]; do
      case "$1" in --limit) limit=$2 ;; esac
      shift
    done
    printf '%s\n' "\${STUB_LIST:-}" | head -n "\${limit:-30}" | grep . ;;
esac
exit 0
`

/* A `gzip` that writes nothing to stdout and exits 1. */
const failingGzip = `#!/usr/bin/env bash
echo "gzip: stub failure" >&2
exit 1
`

/* A shim for one of the coreutils the version comparison pipes through. Its
   `call`th use exits `code` after reading its input and writing nothing; every
   other use, and every `grep` without -E, runs the real tool. */
const failingTool = (
  tool: string,
  code: number,
  call: number,
) => `#!/usr/bin/env bash
real=$(PATH=\${PATH#*:} command -v ${tool})
${tool === 'grep' ? '[[ " $* " == *" -E "* ]] || exec "$real" "$@"' : ''}
count=$(( $(cat "$STUB_LOG.${tool}" 2>/dev/null || echo 0) + 1 ))
echo "$count" > "$STUB_LOG.${tool}"
[ "$count" -eq ${call} ] || exec "$real" "$@"
cat > /dev/null
echo "${tool}: stub failure" >&2
exit ${code}
`

const dirs: string[] = []
afterEach(() => {
  vi.unstubAllEnvs()
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true })
})

interface Options {
  tag?: string
  view?: string
  /** Contents of the tarball the build packed. */
  tarballs?: Record<string, Uint8Array>
  /** Contents of the asset on the published release; absent when omitted. */
  published?: Uint8Array
  /** Tags `gh release list` returns. */
  list?: string[]
  listFails?: boolean
  /** Put a `gzip` that always fails first on PATH. */
  gzipFails?: boolean
  /** What every `gh release view` after the first reports, as STUB_VIEW does. */
  viewLater?: string
  /** `gh release` subcommands that fail. */
  writeFails?: Array<'create' | 'upload' | 'edit'>
  /** Make the `call`th use of a tool in the version comparison exit `code`. */
  toolFails?: {
    tool: 'grep' | 'sed' | 'sort' | 'tail'
    code?: number
    call?: number
  }
}

const run = (options: Options) => {
  const dir = mkdtempSync(join(tmpdir(), 'publish-release-'))
  dirs.push(dir)
  mkdirSync(join(dir, 'bin'))
  mkdirSync(join(dir, 'release-artifacts'))
  writeFileSync(join(dir, 'bin', 'gh'), stub, { mode: 0o755 })
  const tarballs = options.tarballs ?? { 'a.tgz': gzipSync('built') }
  for (const [name, bytes] of Object.entries(tarballs)) {
    writeFileSync(join(dir, 'release-artifacts', name), bytes)
  }
  if (options.gzipFails) {
    writeFileSync(join(dir, 'bin', 'gzip'), failingGzip, { mode: 0o755 })
  }
  if (options.toolFails) {
    const { tool, code = 1, call = 1 } = options.toolFails
    writeFileSync(join(dir, 'bin', tool), failingTool(tool, code, call), {
      mode: 0o755,
    })
  }
  // Only PATH is inherited, after the stub's bin, for bash and the coreutils.
  // The rest is set here: HOME is the temp directory, which keeps a real gh's
  // stored login (hosts.yml) out; GH_REPO points nowhere real and no token
  // is set. Nothing else of the caller's shell (an exported function,
  // BASH_ENV, GH_TOKEN) reaches the script.
  const env = {
    PATH: `${join(dir, 'bin')}:${process.env.PATH ?? ''}`,
    HOME: dir,
    TMPDIR: dir,
    LANG: 'C',
    GH_REPO: 'invalid/invalid',
    RELEASE_TAG: options.tag ?? 'v0.5.0',
    STUB_LOG: join(dir, 'log'),
    STUB_VIEW: options.view ?? 'none',
    STUB_LIST: (options.list ?? []).join('\n'),
    ...(options.published && { STUB_ASSET: join(dir, 'published') }),
    ...(options.listFails && { STUB_LIST_FAIL: '1' }),
    ...(options.viewLater && { STUB_VIEW_LATER: options.viewLater }),
    ...(options.writeFails && {
      STUB_FAIL_WRITE: options.writeFails.join(' '),
    }),
  }
  if (options.published) {
    writeFileSync(join(dir, 'published'), options.published)
  }
  const result = spawnSync('bash', [script], {
    cwd: dir,
    env,
    encoding: 'utf8',
  })
  const read = (name: string) => {
    try {
      return readFileSync(join(dir, name), 'utf8')
    } catch {
      return '' // no gh call was made
    }
  }
  const calls = read('log').split('\n').filter(Boolean)
  return {
    dir,
    envSeen: read('log.env').split('\n').filter(Boolean),
    status: result.status,
    output: `${result.stdout}${result.stderr}`,
    calls,
    writes: calls.filter((call) => /^release (create|upload|edit) /.test(call)),
  }
}

const VIEW_ARGS = 'release view v0.5.0 --json isDraft --jq .isDraft'

const LIST_ARGS =
  'release list --exclude-drafts --exclude-pre-releases --limit 1000 --json tagName --jq .[].tagName'

describe('a release that does not exist yet', () => {
  it('creates a draft, uploads, then publishes as Latest', () => {
    const result = run({ view: 'none', list: ['v0.4.0', 'v0.3.0'] })
    expect(result.status).toBe(0)
    expect(result.calls).toEqual([
      VIEW_ARGS,
      'release create v0.5.0 --verify-tag --generate-notes --draft',
      VIEW_ARGS,
      'release upload v0.5.0 release-artifacts/a.tgz --clobber',
      LIST_ARGS,
      'release edit v0.5.0 --draft=false --prerelease=false --latest=true',
    ])
  })

  it('marks the very first release Latest when nothing else is published', () => {
    const result = run({ view: 'none', list: [] })
    expect(result.status).toBe(0)
    expect(result.writes.at(-1)).toBe(
      'release edit v0.5.0 --draft=false --prerelease=false --latest=true',
    )
  })

  it.each([[['v0.4.0']], [[]]])(
    'publishes a pre-release as one, never Latest (published: %j)',
    (list) => {
      const result = run({ tag: 'v0.6.0-rc.1', view: 'none', list })
      expect(result.status).toBe(0)
      expect(result.writes).toEqual([
        'release create v0.6.0-rc.1 --verify-tag --generate-notes --draft --prerelease',
        'release upload v0.6.0-rc.1 release-artifacts/a.tgz --clobber',
        'release edit v0.6.0-rc.1 --draft=false --prerelease=true --latest=false',
      ])
      // Latest is decided without the list.
      expect(result.calls).not.toContain(LIST_ARGS)
    },
  )

  it('keeps the highest published version as Latest for a back-port', () => {
    const result = run({
      tag: 'v0.4.1',
      view: 'none',
      list: ['v0.5.0', 'v0.4.0'],
    })
    expect(result.status).toBe(0)
    expect(result.writes.at(-1)).toBe(
      'release edit v0.4.1 --draft=false --prerelease=false --latest=false',
    )
  })

  it('takes Latest from a lower published version', () => {
    const result = run({ tag: 'v0.10.0', view: 'none', list: ['v0.9.0'] })
    expect(result.writes.at(-1)).toBe(
      'release edit v0.10.0 --draft=false --prerelease=false --latest=true',
    )
  })

  it('compares versions in numeric order, not text order', () => {
    // As text v0.10.0 sorts before v0.9.0, and v0.9.1 after both.
    const result = run({
      tag: 'v0.9.1',
      view: 'none',
      list: ['v0.10.0', 'v0.9.0'],
    })
    expect(result.writes.at(-1)).toBe(
      'release edit v0.9.1 --draft=false --prerelease=false --latest=false',
    )
  })

  it('reads a listed tag with build metadata as its version', () => {
    const result = run({
      tag: 'v0.9.1',
      view: 'none',
      list: ['v1.0.0+build.1', 'v0.9.0'],
    })
    expect(result.writes.at(-1)).toBe(
      'release edit v0.9.1 --draft=false --prerelease=false --latest=false',
    )
  })

  it('does not rank a listed tag above the same version by its build metadata', () => {
    // sort -V puts v1.0.0+build.1 above v1.0.0 unless the metadata is stripped.
    const result = run({
      tag: 'v1.0.0',
      view: 'none',
      list: ['v1.0.0+build.1', 'v0.9.0'],
    })
    expect(result.writes.at(-1)).toBe(
      'release edit v1.0.0 --draft=false --prerelease=false --latest=true',
    )
  })

  it('finds a higher version beyond the first 100 releases', () => {
    // Newest first: 119 lower releases, then the highest stable one.
    const list = [
      ...Array.from({ length: 119 }, (_, i) => `v0.1.${118 - i}`),
      'v0.9.0',
    ]
    const result = run({ tag: 'v0.5.0', view: 'none', list })
    expect(result.status).toBe(0)
    expect(result.writes.at(-1)).toBe(
      'release edit v0.5.0 --draft=false --prerelease=false --latest=false',
    )
  })

  it.each(['v9.0.0+/../x', 'v2.0.0+', 'v2.0.0+a+b', 'v2.0.0+a.'])(
    'ignores a listed tag with malformed build metadata (%s)',
    (listed) => {
      const result = run({ tag: 'v1.0.0', view: 'none', list: [listed] })
      expect(result.writes.at(-1)).toContain('--latest=true')
    },
  )

  it('ignores listed tags that are not plain versions', () => {
    const result = run({ tag: 'v0.5.0', view: 'none', list: ['nightly', 'v9'] })
    expect(result.writes.at(-1)).toContain('--latest=true')
  })

  it('reads a hyphen only before build metadata as a pre-release', () => {
    expect(run({ tag: 'v1.0.0+build-1', view: 'none' }).writes.at(-1)).toBe(
      'release edit v1.0.0+build-1 --draft=false --prerelease=false --latest=true',
    )
    expect(run({ tag: 'v1.0.0-rc.1+build', view: 'none' }).writes.at(-1)).toBe(
      'release edit v1.0.0-rc.1+build --draft=false --prerelease=true --latest=false',
    )
  })

  it('stops before publishing when the release list fails', () => {
    const result = run({ view: 'none', listFails: true })
    expect(result.status).not.toBe(0)
    expect(result.writes.join('\n')).not.toContain('release edit')
    // The draft and its asset are left for a rerun to complete.
    expect(result.writes).toEqual([
      'release create v0.5.0 --verify-tag --generate-notes --draft',
      'release upload v0.5.0 release-artifacts/a.tgz --clobber',
    ])
    expect(result.output).toContain('stays a draft')
  })

  it('does not treat a failed list as a first release for a back-port', () => {
    const result = run({ tag: 'v0.4.1', view: 'draft', listFails: true })
    expect(result.status).not.toBe(0)
    expect(result.writes.join('\n')).not.toContain('release edit')
  })
})

describe('a version comparison that fails', () => {
  // A listed tag, so the comparison runs; call 2 of sort and tail is the one
  // that compares the highest listed version with the released one.
  it.each([
    ['grep fails', { tool: 'grep', code: 2 }],
    ['sed fails', { tool: 'sed' }],
    ['the first sort fails', { tool: 'sort' }],
    ['the first tail fails', { tool: 'tail' }],
    ['the second sort fails', { tool: 'sort', call: 2 }],
    ['the second tail fails', { tool: 'tail', call: 2 }],
  ] as const)('leaves a draft for a rerun when %s', (_name, toolFails) => {
    const result = run({ view: 'none', list: ['v0.4.0'], toolFails })
    expect(result.status).toBe(1)
    expect(result.writes).toEqual([
      'release create v0.5.0 --verify-tag --generate-notes --draft',
      'release upload v0.5.0 release-artifacts/a.tgz --clobber',
    ])
    expect(result.output).toContain('stays a draft')
    expect(result.output).toContain('rerun')
  })

  it('still reads grep finding no stable version as no higher version', () => {
    const result = run({
      view: 'none',
      list: ['nightly'],
      toolFails: { tool: 'grep', code: 1 },
    })
    expect(result.status).toBe(0)
    expect(result.writes.at(-1)).toContain('--latest=true')
  })
})

describe('a write that fails', () => {
  it.each([
    ['create', 'none', ['create']],
    ['upload', 'none', ['create', 'upload']],
    ['edit', 'none', ['create', 'upload', 'edit']],
    ['upload', 'draft', ['upload']],
    ['edit', 'draft', ['upload', 'edit']],
  ] as const)(
    'stops after a failed %s (release: %s)',
    (failing, view, expected) => {
      const result = run({ view, list: ['v0.4.0'], writeFails: [failing] })
      expect(result.status).toBe(1)
      expect(result.writes.map((call) => call.split(' ')[1])).toEqual(expected)
      expect(result.output).toContain(`stub ${failing} failure`)
    },
  )

  it('completes a pre-release draft left by a failed upload as a pre-release, never Latest', () => {
    const tag = 'v0.6.0-rc.1'
    const failed = run({
      tag,
      view: 'none',
      list: ['v0.4.0'],
      writeFails: ['upload'],
    })
    expect(failed.status).toBe(1)
    expect(failed.writes).toEqual([
      `release create ${tag} --verify-tag --generate-notes --draft --prerelease`,
      `release upload ${tag} release-artifacts/a.tgz --clobber`,
    ])
    const rerun = run({ tag, view: 'draft', list: ['v0.4.0'] })
    expect(rerun.status).toBe(0)
    expect(rerun.writes).toEqual([
      `release upload ${tag} release-artifacts/a.tgz --clobber`,
      `release edit ${tag} --draft=false --prerelease=true --latest=false`,
    ])
  })
})

describe('a draft release', () => {
  it('replaces the asset and publishes without creating', () => {
    const result = run({ view: 'draft', list: ['v0.4.0'] })
    expect(result.status).toBe(0)
    expect(result.writes).toEqual([
      'release upload v0.5.0 release-artifacts/a.tgz --clobber',
      'release edit v0.5.0 --draft=false --prerelease=false --latest=true',
    ])
  })
})

describe('a draft whose state changes before the upload', () => {
  it('takes the published path when it was published by hand', () => {
    const result = run({
      view: 'draft',
      viewLater: 'published',
      published: gzipSync('built'),
    })
    expect(result.status).toBe(0)
    expect(result.writes).toEqual([])
    expect(
      result.calls.filter((call) => call.startsWith('release view')),
    ).toHaveLength(2)
    expect(result.output).toContain('already published with an identical')
  })

  it('does not replace the asset of a release published by hand while building a new one', () => {
    const result = run({
      view: 'none',
      viewLater: 'published',
      published: gzipSync('other'),
    })
    expect(result.status).toBe(1)
    expect(result.writes).toEqual([
      'release create v0.5.0 --verify-tag --generate-notes --draft',
    ])
    expect(result.output).toContain('differs from this build')
  })

  it('fails when the second lookup fails', () => {
    const result = run({ view: 'draft', viewLater: 'error' })
    expect(result.status).toBe(1)
    expect(result.writes).toEqual([])
    expect(result.output).toContain('Could not look up release')
  })

  it('fails when the release is gone at the second lookup', () => {
    const result = run({ view: 'draft', viewLater: 'none' })
    expect(result.status).toBe(1)
    expect(result.writes).toEqual([])
    expect(result.output).toContain('no longer exists')
  })
})

describe('an already published release', () => {
  const built = gzipSync('built')

  it('succeeds without changes when the asset is byte-identical', () => {
    const result = run({ view: 'published', published: built })
    expect(result.status).toBe(0)
    expect(result.writes).toEqual([])
    expect(result.output).toContain('already published with an identical')
    expect(result.output).not.toContain('compressed differently')
  })

  it('succeeds without changes when only the compression differs', () => {
    const contents = 'the same contents '.repeat(500)
    const fast = gzipSync(contents, { level: 1 })
    const best = gzipSync(contents, { level: 9 })
    expect(Buffer.compare(fast, best)).not.toBe(0)
    const result = run({
      view: 'published',
      tarballs: { 'a.tgz': fast },
      published: best,
    })
    expect(result.status).toBe(0)
    expect(result.writes).toEqual([])
    expect(result.output).toContain('compressed differently')
  })

  it('fails without changes when the asset differs', () => {
    const result = run({ view: 'published', published: gzipSync('other') })
    expect(result.status).toBe(1)
    expect(result.writes).toEqual([])
    expect(result.output).toContain('differs from this build')
    expect(result.output).toMatch(/published sha256 [0-9a-f]{64}/)
  })

  it('fails without changes when the published asset is not gzip', () => {
    const result = run({
      view: 'published',
      published: new Uint8Array([1, 2, 3]),
    })
    expect(result.status).toBe(1)
    expect(result.writes).toEqual([])
  })

  describe('when the published asset has the same contents but is damaged', () => {
    const contents = 'the same contents '.repeat(500)
    const built = gzipSync(contents, { level: 1 })
    const intact = gzipSync(contents, { level: 9 })
    const trailer = intact.length - 8
    const corruptCrc = Buffer.from(intact)
    corruptCrc[trailer] ^= 0xff

    it.each([
      ['is truncated inside the trailer', intact.subarray(0, trailer + 4)],
      ['is truncated before the trailer', intact.subarray(0, trailer)],
      ['has a bad CRC', corruptCrc],
      [
        'has trailing garbage',
        Buffer.concat([intact, Buffer.from('not gzip')]),
      ],
    ])('fails without changes when it %s', (_name, published) => {
      const result = run({
        view: 'published',
        tarballs: { 'a.tgz': built },
        published,
      })
      expect(result.status).toBe(1)
      expect(result.writes).toEqual([])
      expect(result.output).toContain(
        'gzip could not decompress the published a.tgz (see',
      )
      expect(result.output).toContain(
        'Convert the release back to a draft and rerun.',
      )
      expect(result.output).not.toContain('the built a.tgz')
      expect(result.output).not.toContain('Rebuild')
      // gzip's own reason is kept.
      expect(result.output).toMatch(/gzip: /)
      expect(result.output).not.toContain('differs from this build')
    })

    it('fails without changes when the built tarball is damaged', () => {
      const result = run({
        view: 'published',
        tarballs: { 'a.tgz': intact.subarray(0, trailer) },
        published: built,
      })
      expect(result.status).toBe(1)
      expect(result.writes).toEqual([])
      expect(result.output).toContain(
        'gzip could not decompress the built a.tgz (see',
      )
      expect(result.output).toContain('Rebuild the tarball and rerun')
      expect(result.output).not.toContain('the published a.tgz')
      expect(result.output).not.toContain('onvert the release')
    })
  })

  it('fails without changes when gzip fails on both sides', () => {
    const result = run({
      view: 'published',
      tarballs: { 'a.tgz': gzipSync('built', { level: 1 }) },
      published: gzipSync('other', { level: 9 }),
      gzipFails: true,
    })
    expect(result.status).toBe(1)
    expect(result.writes).toEqual([])
    expect(result.output).toContain(
      'gzip could not decompress the built a.tgz and the published a.tgz (see',
    )
    expect(result.output).toContain('gzip: stub failure')
    expect(result.output).toContain(
      'Rebuild the tarball, convert the release back to a draft and rerun.',
    )
  })

  it('fails without changes when the built and published tarballs are the same damaged bytes', () => {
    const damaged = gzipSync('built').subarray(0, 12)
    const result = run({
      view: 'published',
      tarballs: { 'a.tgz': damaged },
      published: damaged,
    })
    expect(result.status).toBe(1)
    expect(result.writes).toEqual([])
    expect(result.output).toContain(
      'gzip could not decompress the built a.tgz and the published a.tgz (see',
    )
    expect(result.output).not.toContain('identical')
  })

  it('fails without changes when the asset is missing or cannot be downloaded', () => {
    const result = run({ view: 'published' })
    expect(result.status).toBe(1)
    expect(result.writes).toEqual([])
    expect(result.output).toContain('no assets match')
    expect(result.output).toContain('convert the release back to a draft')
  })
})

describe('an unusable lookup', () => {
  it('fails without writing when the lookup is rejected', () => {
    const result = run({ view: 'error' })
    expect(result.status).toBe(1)
    expect(result.calls).toEqual([
      'release view v0.5.0 --json isDraft --jq .isDraft',
    ])
    expect(result.output).toContain('HTTP 401')
  })

  it.each(['empty', 'null'])(
    'fails without writing when isDraft comes back as %s',
    (view) => {
      const result = run({ view, published: gzipSync('other') })
      expect(result.status).toBe(1)
      expect(result.writes).toEqual([])
      expect(result.output).toContain('Unexpected isDraft value')
    },
  )
})

describe("the script's environment", () => {
  it("passes nothing of the caller's shell or credentials to the script", () => {
    const dir = mkdtempSync(join(tmpdir(), 'publish-release-env-'))
    dirs.push(dir)
    // Sourced by every non-interactive bash that BASH_ENV reaches: it would
    // shadow the stub with a function that records a bypass.
    writeFileSync(
      join(dir, 'bash-env'),
      'gh() { echo "BYPASS $*" >> "$STUB_LOG"; }\n',
    )
    vi.stubEnv('BASH_ENV', join(dir, 'bash-env'))
    vi.stubEnv('GH_TOKEN', 'caller-token')
    vi.stubEnv('GH_REPO', 'caller/repo')
    const result = run({ view: 'none' })
    expect(result.status).toBe(0)
    expect(result.calls.join('\n')).not.toContain('BYPASS')
    expect(result.calls).toHaveLength(6)
    expect(new Set(result.envSeen)).toEqual(
      new Set([`GH_TOKEN=unset GH_REPO=invalid/invalid HOME=${result.dir}`]),
    )
  })
})

describe('the work directory', () => {
  it('is created under TMPDIR', () => {
    const result = run({ view: 'published', published: gzipSync('built') })
    expect(result.status).toBe(0)
    const download = result.calls.find((call) =>
      call.startsWith('release download'),
    )
    expect(download).toContain(`--dir ${result.dir}/publish-release.`)
  })

  it('is removed when the script ends', () => {
    const result = run({ view: 'published', published: gzipSync('built') })
    expect(
      readdirSync(result.dir).filter((name) =>
        name.startsWith('publish-release.'),
      ),
    ).toEqual([])
  })
})

describe('the release tag', () => {
  it.each([
    'v1.0',
    '1.0.0',
    'v1.0.0+',
    'v1.0.0-',
    'v1.0.0-rc..1',
    'v1.0.0+a+b',
    'v1.0.0+a.',
    'v1.0.0 x',
    'v1.0.0-rc.1+/../x',
  ])('is refused before any gh call when it is %j', (tag) => {
    const result = run({ tag })
    expect(result.status).toBe(1)
    expect(result.calls).toEqual([])
    expect(result.output).toContain('RELEASE_TAG')
  })
})

describe('the packed tarball', () => {
  it('fails before any gh call when there is none', () => {
    const result = run({ tarballs: {} })
    expect(result.status).toBe(1)
    expect(result.calls).toEqual([])
    expect(result.output).toContain('found 0')
  })

  it('fails before any gh call when there are two', () => {
    const result = run({
      tarballs: { 'a.tgz': gzipSync('a'), 'b.tgz': gzipSync('b') },
    })
    expect(result.status).toBe(1)
    expect(result.calls).toEqual([])
    expect(result.output).toContain('found 2')
  })
})
