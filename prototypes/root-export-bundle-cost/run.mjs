/**
 * PROTOTYPE — throwaway. One command:
 *   node prototypes/root-export-bundle-cost/run.mjs
 *
 * Bundles nine consumer entries against the real built `dist/`, once per
 * bundler, and reports bytes rather than impressions. Rollup additionally
 * reports which dist modules survived tree-shaking, which is the direct
 * answer to "does a consumer importing only `{ maybe }` still ship the four
 * Box classes".
 *
 * Requires `pnpm build` at the repo root first — the harness links the
 * package, so it bundles the same files a consumer would install.
 */
import { gzipSync } from 'node:zlib'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { rollup } from 'rollup'
import nodeResolve from '@rollup/plugin-node-resolve'
import * as esbuild from 'esbuild'
import webpack from 'webpack'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..')

const CONSUMERS = [
  ['1 ns-root baseline', '1-ns-root-baseline.js'],
  ['2 ns-root + classes', '2-ns-root-with-classes.js'],
  ['3 named fn, subpath', '3-named-fn-subpath.js'],
  ['4 Maybe, root', '4-class-root-one.js'],
  ['5 Maybe, subpath', '5-class-subpath-one.js'],
  ['6 all four, root', '6-class-root-all-four.js'],
  ['7 maybe + Maybe, root', '7-mixed-root.js'],
  ['8 Result Box, one call', '8-class-subpath-result.js'],
  ['9 result fn, one call', '9-named-fn-result.js'],
  ['10 Call Box, one call', '10-class-subpath-call.js'],
  ['11 Fn Box, one call', '11-class-subpath-fn.js'],
  ['12 four namespaces, root', '12-four-namespaces-root.js'],
  ['13 call/abortable fn', '13-named-fn-call.js'],
  ['14 no /call at all', '14-named-fn-call-invoke-only.js'],
]

const gz = (code) => gzipSync(Buffer.from(code), { level: 9 }).length
const minify = async (code) =>
  (await esbuild.transform(code, { minify: true, format: 'esm' })).code

/** Rollup: pure ESM static analysis, plus a per-module byte breakdown. */
async function viaRollup(entry) {
  const bundle = await rollup({
    input: join(here, 'consumers', entry),
    plugins: [nodeResolve({ exportConditions: ['default'] })],
    onwarn: () => {},
  })
  const { output } = await bundle.generate({ format: 'es' })
  await bundle.close()
  const chunk = output[0]
  // `renderedLength` counts docblocks, which dwarf the code in `dist` and
  // never reach a consumer — minify each module's own rendered source so the
  // per-module attribution is in shipped bytes. Not identical to whole-bundle
  // minification (no cross-module renaming), but honest to within noise.
  const modules = []
  for (const [id, m] of Object.entries(chunk.modules)) {
    if (m.renderedLength === 0) {
      continue
    }
    modules.push([relative(repo, id), (await minify(m.code)).length])
  }
  modules.sort((a, b) => b[1] - a[1])
  const min = await minify(chunk.code)
  return { raw: chunk.code.length, min: min.length, gzip: gz(min), modules }
}

/** esbuild: the bundler most consumers meet through Vite's dev path. */
async function viaEsbuild(entry) {
  const result = await esbuild.build({
    entryPoints: [join(here, 'consumers', entry)],
    bundle: true,
    format: 'esm',
    minify: true,
    write: false,
    logLevel: 'silent',
    absWorkingDir: here,
  })
  const code = result.outputFiles[0].text
  return { min: code.length, gzip: gz(code) }
}

/** webpack: the one with a reputation for choking on `export * as ns`. */
function viaWebpack(entry) {
  const out = mkdtempSync(join(tmpdir(), 'box-bundle-'))
  return new Promise((resolve, reject) => {
    webpack(
      {
        mode: 'production',
        entry: join(here, 'consumers', entry),
        experiments: { outputModule: true },
        output: {
          path: out,
          filename: 'bundle.mjs',
          library: { type: 'module' },
          module: true,
        },
        resolve: { conditionNames: ['default'] },
        target: 'web',
        performance: { hints: false },
      },
      (error, stats) => {
        if (error || stats.hasErrors()) {
          rmSync(out, { recursive: true, force: true })
          reject(error ?? new Error(stats.toString({ all: false, errors: true })))
          return
        }
        const code = readFileSync(join(out, 'bundle.mjs'), 'utf8')
        rmSync(out, { recursive: true, force: true })
        resolve({ min: code.length, gzip: gz(code) })
      },
    )
  })
}

const pad = (s, n) => String(s).padEnd(n)
const num = (s, n) => String(s).padStart(n)

const rows = []
for (const [label, entry] of CONSUMERS) {
  const r = await viaRollup(entry)
  const e = await viaEsbuild(entry)
  const w = await viaWebpack(entry)
  rows.push({ label, entry, r, e, w })
}

console.log('\n=== shipped bytes per consumer (minified / gzipped) ===\n')
console.log(
  `${pad('consumer', 24)}${num('rollup', 14)}${num('esbuild', 14)}${num('webpack', 14)}`,
)
console.log('-'.repeat(66))
for (const { label, r, e, w } of rows) {
  const cell = (x) => num(`${x.min} / ${x.gzip}`, 14)
  console.log(`${pad(label, 24)}${cell(r)}${cell(e)}${cell(w)}`)
}

console.log('\n=== rollup: dist modules that survived tree-shaking ===')
for (const { label, r } of rows) {
  console.log(`\n${label}  (${r.modules.length} modules, ${r.raw} B unminified)`)
  for (const [id, bytes] of r.modules) {
    console.log(`  ${num(bytes, 6)} B  ${id}`)
  }
}

const boxOf = (row, file) =>
  row.r.modules.some(([id]) => id.endsWith(file)) ? 'PRESENT' : 'dropped'

console.log('\n=== the question the ticket asks ===\n')
for (const { label, r } of rows) {
  const row = { r }
  console.log(
    `${pad(label, 24)} maybe/box ${pad(boxOf(row, 'maybe/box.js'), 8)}` +
      ` result/box ${pad(boxOf(row, 'result/box.js'), 8)}` +
      ` fn/box ${pad(boxOf(row, 'fn/box.js'), 8)}` +
      ` call/box ${boxOf(row, 'call/box.js')}`,
  )
}
