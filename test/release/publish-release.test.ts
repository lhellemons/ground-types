/* Drives scripts/publish-release.sh, the only guard on the write-scoped
   release job, against a stub `gh` that records every call. Nothing here
   touches GitHub: the stub is first on PATH and the script runs in a temp
   directory holding fake tarballs. Needs bash, sort -V, gzip, cmp and
   sha256sum, which ubuntu-latest has. */
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
import { afterEach, describe, expect, it } from 'vitest'

const script = fileURLToPath(
  new URL('../../scripts/publish-release.sh', import.meta.url),
)

/* Prints what `gh` would print after its own --jq filter, driven by env:
   STUB_VIEW     none | error | draft | published | empty | null
   STUB_ASSET    file served by `release download`; unset fails the download
   STUB_LIST     newline-separated tags printed by `release list`
   STUB_LIST_FAIL  set to make `release list` fail
   Every call is appended to STUB_LOG, one line each. */
const stub = `#!/usr/bin/env bash
echo "$*" >> "$STUB_LOG"
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

const dirs: string[] = []
afterEach(() => {
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
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    PATH: `${join(dir, 'bin')}:${process.env.PATH ?? ''}`,
    RELEASE_TAG: options.tag ?? 'v0.5.0',
    STUB_LOG: join(dir, 'log'),
    STUB_VIEW: options.view ?? 'none',
    STUB_LIST: (options.list ?? []).join('\n'),
  }
  if (options.published) {
    writeFileSync(join(dir, 'published'), options.published)
    env.STUB_ASSET = join(dir, 'published')
  }
  if (options.listFails) env.STUB_LIST_FAIL = '1'
  const result = spawnSync('bash', [script], {
    cwd: dir,
    env,
    encoding: 'utf8',
  })
  let log = ''
  try {
    log = readFileSync(join(dir, 'log'), 'utf8')
  } catch {
    // no gh call was made
  }
  const calls = log.split('\n').filter(Boolean)
  return {
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
    expect(result.output).toContain('Nothing to do')
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
