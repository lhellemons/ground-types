/**
 * PROTOTYPE — throwaway. One command: `node prototypes/value-only-class-binding/run.mjs`
 *
 * The whole prototype is a type-level claim, so the compiler is the harness.
 * Claims that must HOLD are `expectTypeOf`; claims that must FAIL are
 * `@ts-expect-error` — both are proven by pass 1 compiling cleanly. Pass 2 is
 * the one declaration-emit claim that `@ts-expect-error` cannot express.
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const repo = join(here, '..', '..')

const tsc = (project) =>
  spawnSync('npx', ['tsc', '-p', join(here, project)], {
    cwd: repo,
    encoding: 'utf8',
  })

console.log('--- pass 1: every inline claim (must compile clean) ---')
const main = tsc('tsconfig.json')
const mainOk = main.status === 0
console.log(main.stdout.trim() || '(no output)')
console.log(mainOk ? 'PASS' : 'FAIL')

console.log('\n--- pass 2: declaration-leak.ts (must fail with TS4094) ---')
const leak = tsc('tsconfig.declaration-leak.json')
const leakOk = leak.status !== 0 && leak.stdout.includes('TS4094')
console.log(leak.stdout.trim() || '(no output)')
console.log(leakOk ? 'PASS (failed as required)' : 'FAIL (did not fail)')

console.log('\n--- pass 3: same claims against the emitted .d.ts ---')
const dts = tsc('tsconfig.dts-consumer.json')
const dtsOk = dts.status === 0
console.log(dts.stdout.trim() || '(no output)')
console.log(dtsOk ? 'PASS' : 'FAIL')

const all = mainOk && leakOk && dtsOk
console.log(`\nVERDICT: ${all ? 'ALL CLAIMS HELD' : 'SEE ABOVE'}`)
process.exit(all ? 0 : 1)
