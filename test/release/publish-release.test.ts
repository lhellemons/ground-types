/* Drives scripts/publish-release.sh against a stub `gh` that records every
   call. Nothing here touches GitHub: the stub is first on PATH and the script
   runs in a temp directory holding fake tarballs, with an environment built
   from scratch. Runs with `pnpm test`, locally and in CI. */
import { spawnSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
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
   STUB_VIEW     none | error | draft | published | empty | null
   STUB_ASSET    file served by `release download`; unset fails the download
   STUB_LIST     newline-separated tags printed by `release list`
   STUB_LIST_FAIL  set to make `release list` fail
   Every call is appended to STUB_LOG, one line each, and the GH_TOKEN and
   GH_REPO it saw to STUB_LOG.env. */
const stub = `#!/usr/bin/env bash
echo "$*" >> "$STUB_LOG"
echo "GH_TOKEN=\${GH_TOKEN-unset} GH_REPO=\${GH_REPO-unset}" >> "$STUB_LOG.env"
case "$1 $2" in
  "release view")
    case "$STUB_VIEW" in
      none) echo "release not found" >&2; exit 1 ;;
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
    printf '%s' "\${STUB_LIST:-}" ;;
esac
exit 0
`

/* A `gzip` that fails after printing nothing. */
const failingGzip = `#!/usr/bin/env bash
echo "gzip: stub failure" >&2
exit 1
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
  // Built from scratch: nothing of the caller's shell (an exported function,
  // BASH_ENV, GH_TOKEN) reaches the script. GH_REPO points nowhere real and no
  // token is set, so a call that got past the stub could not write.
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
    envSeen: read('log.env').split('\n').filter(Boolean),
    status: result.status,
    output: `${result.stdout}${result.stderr}`,
    calls,
    writes: calls.filter((call) => /^release (create|upload|edit) /.test(call)),
  }
}

const LIST_ARGS =
  'release list --exclude-drafts --exclude-pre-releases --limit 100 --json tagName --jq .[].tagName'

describe('a release that does not exist yet', () => {
  it('creates a draft, uploads, then publishes as Latest', () => {
    const result = run({ view: 'none', list: ['v0.4.0', 'v0.3.0'] })
    expect(result.status).toBe(0)
    expect(result.calls).toEqual([
      'release view v0.5.0 --json isDraft --jq .isDraft',
      'release create v0.5.0 --verify-tag --generate-notes --draft',
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
      expect(result.output).toContain('differs from this build')
    })

    it('succeeds for the same asset when intact', () => {
      const result = run({
        view: 'published',
        tarballs: { 'a.tgz': built },
        published: intact,
      })
      expect(result.status).toBe(0)
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
    expect(result.output).toContain('differs from this build')
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
    expect(result.calls).toHaveLength(5)
    expect(new Set(result.envSeen)).toEqual(
      new Set(['GH_TOKEN=unset GH_REPO=invalid/invalid']),
    )
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
