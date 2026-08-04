/**
 * PROTOTYPE — throwaway. One command:
 * `node prototypes/maybe-result-box-cycle/run.mjs`
 *
 * Four things are being measured, in this order:
 *
 *  1. compile — does each variant typecheck and emit at all?
 *  2. declaration emit — can a cross-Box return type even be NAMED, given
 *     decision 5 suppresses every type binding?
 *  3. runtime — does the cycle actually break under Node's ESM evaluation,
 *     and does the answer depend on which side the consumer imports first?
 *  4. module closure — what does importing `maybe/box` drag in?
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve, relative } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..')
const out = join(
  repo,
  '.local',
  'proto-cycle',
  'prototypes',
  'maybe-result-box-cycle',
)

const tsc = (project) =>
  spawnSync('npx', ['tsc', '-p', join(here, project)], {
    cwd: repo,
    encoding: 'utf8',
  })

const node = (entry) =>
  spawnSync('node', [join(out, entry)], { cwd: repo, encoding: 'utf8' })

const results = []
const claim = (name, ok, note = '') => {
  results.push({ name, ok })
  console.log(`  ${ok ? 'PASS' : 'FAIL'} — ${name}${note ? ` (${note})` : ''}`)
}

/* -------------------------------------------------------------------- *
 * 1 + 2. compile, and declaration emit
 * -------------------------------------------------------------------- */

console.log('\n=== pass 1: variants A–E compile and emit (must succeed) ===')
const main = tsc('tsconfig.json')
console.log(main.stdout.trim() || '(no output)')
claim(
  'A–E compile, with cross-Box return types spelled via ReturnType',
  main.status === 0,
)

console.log(
  '\n=== pass 2: A′, the same cycle with the return type INFERRED ===',
)
console.log('(must fail: the emitter has to name a class no module exports)')
const inferred = tsc('tsconfig.inferred-return.json')
console.log(inferred.stdout.trim() || '(no output)')
const namingError = /TS(4060|4053|2742|4094|4058)/.test(inferred.stdout)
claim(
  'A′ fails declaration emit with a naming error',
  inferred.status !== 0 && namingError,
  (inferred.stdout.match(/TS\d+/g) ?? []).join(' '),
)

/* -------------------------------------------------------------------- *
 * 3. runtime
 * -------------------------------------------------------------------- */

const runs = [
  [
    'A  deferred cycle, entered from maybe',
    'a-deferred-cycle/enter-maybe.js',
    'ok',
  ],
  [
    'A  deferred cycle, entered from result',
    'a-deferred-cycle/enter-result.js',
    'ok',
  ],
  [
    'B  eager cycle, entered from maybe',
    'b-eager-cycle/enter-maybe.js',
    'crash',
  ],
  [
    'B  eager cycle, entered from result',
    'b-eager-cycle/enter-result.js',
    'ok',
  ],
  ['C  shared module', 'c-shared-module/enter.js', 'ok'],
  ['D  one-sided', 'd-one-sided/enter.js', 'ok'],
  ['E  statics only', 'e-statics-only/enter.js', 'ok'],
]

console.log('\n=== pass 3: Node ESM evaluation ===')
for (const [name, entry, expected] of runs) {
  console.log(`\n--- ${name} (expected: ${expected}) ---`)
  const run = node(entry)
  console.log(
    (run.stdout + run.stderr).trim().split('\n').slice(0, 8).join('\n'),
  )
  const crashed = run.status !== 0
  const tdz = /before initialization/.test(run.stderr)
  claim(
    name,
    expected === 'ok' ? !crashed : crashed && tdz,
    crashed ? (tdz ? 'TDZ ReferenceError' : 'crashed') : '',
  )
}

/* -------------------------------------------------------------------- *
 * 4. module closure — what does importing `maybe/box` cost?
 * -------------------------------------------------------------------- */

const IMPORT = /(?:^|\n)\s*(?:import|export)\s[^\n]*?from\s+'([^']+)'/g

const closure = (entry) => {
  const seen = new Map()
  const walk = (file) => {
    if (seen.has(file) || !existsSync(file)) return
    const source = readFileSync(file, 'utf8')
    seen.set(file, source.length)
    for (const [, spec] of source.matchAll(IMPORT)) {
      if (spec.startsWith('.')) walk(resolve(dirname(file), spec))
    }
  }
  walk(entry)
  return seen
}

console.log('\n=== pass 4: transitive module closure of each variant ===')
const entries = [
  ['A  maybe/box', 'a-deferred-cycle/maybe-box.js'],
  ['C  maybe/box', 'c-shared-module/maybe-box.js'],
  ['D  maybe/box', 'd-one-sided/maybe-box.js'],
  ['D  result/box', 'd-one-sided/result-box.js'],
  ['E  maybe/box', 'e-statics-only/maybe-box.js'],
  [
    'E  result/box (takes a Maybe Box as a parameter)',
    'e-statics-only/result-box.js',
  ],
]
for (const [name, entry] of entries) {
  const modules = closure(join(out, entry))
  const bytes = [...modules.values()].reduce((a, b) => a + b, 0)
  const paths = [...modules.keys()].map((p) =>
    relative(join(repo, '.local', 'proto-cycle'), p),
  )
  const pullsInResult = paths.some((p) => /(^|\/)src\/result\//.test(p))
  console.log(
    `\n  ${name}: ${modules.size} modules, ${bytes} bytes` +
      `\n    src/result in the closure: ${pullsInResult ? 'YES' : 'no'}` +
      paths.map((p) => `\n      ${p}`).join(''),
  )
}

/* -------------------------------------------------------------------- *
 * 5. what a bundler makes of it — the closure above is only a cost if
 *    tree-shaking cannot drop it. The consumer imports `Maybe` and calls
 *    `.map()`; it never touches a Result.
 * -------------------------------------------------------------------- */

console.log(
  '\n=== pass 5: esbuild, consumer imports Maybe and never crosses ===',
)
const esbuild = await import(
  join(
    repo,
    'node_modules/.pnpm/esbuild@0.28.1/node_modules/esbuild/lib/main.js',
  )
)

const CONSUMER = `
import { Maybe } from './maybe-box.js'
console.log(Maybe.from(3).map((n) => n * 2).value)
`

for (const [name, dir] of [
  ['A  cycle', 'a-deferred-cycle'],
  ['C  shared module', 'c-shared-module'],
  ['D  one-sided', 'd-one-sided'],
  ['E  statics only', 'e-statics-only'],
]) {
  const bundle = async (minify) =>
    (
      await esbuild.build({
        stdin: {
          contents: CONSUMER,
          resolveDir: join(out, dir),
          sourcefile: 'consumer.js',
        },
        bundle: true,
        write: false,
        format: 'esm',
        treeShaking: true,
        minify,
      })
    ).outputFiles[0].text

  const minified = await bundle(true)
  const readable = await bundle(false)
  const dragged = /isSuccess|ResultBox/.test(readable)
  console.log(
    `  ${name}: ${minified.length} bytes minified — result code in the bundle: ${dragged ? 'YES' : 'no'}`,
  )
}

/* -------------------------------------------------------------------- *
 * The emitted declarations, for reading
 * -------------------------------------------------------------------- */

console.log('\n=== emitted .d.ts (variant A, the cross-module annotation) ===')
console.log(
  readFileSync(join(out, 'a-deferred-cycle/maybe-box.d.ts'), 'utf8').trim(),
)
console.log('\n=== emitted .d.ts (variant C, both classes in one module) ===')
console.log(
  readFileSync(join(out, 'c-shared-module/boxes.d.ts'), 'utf8').trim(),
)
console.log('\n=== emitted .d.ts (variant C, the subpath re-export) ===')
console.log(
  readFileSync(join(out, 'c-shared-module/maybe-box.d.ts'), 'utf8').trim(),
)

const failed = results.filter((r) => !r.ok)
console.log(
  `\nVERDICT: ${failed.length === 0 ? 'every claim held' : `${failed.length} claim(s) did not hold: ${failed.map((f) => f.name).join(', ')}`}`,
)
process.exit(failed.length === 0 ? 0 : 1)
