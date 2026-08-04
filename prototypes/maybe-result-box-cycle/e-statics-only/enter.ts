/**
 * PROTOTYPE — throwaway. A consumer of variant E. Both crossings read the
 * same way: terminate the chain, hand the unboxed value to the other class's
 * static, carry on.
 */
import { Maybe } from './maybe-box.js'
import { Result } from './result-box.js'

const missing = new Error('missing')

const uphill = Result.fromMaybe(
  missing,
  Maybe.from(3).map((n) => n * 2).value,
).map((n) => `${n}`).result
console.log('  Maybe -> Result:', uphill)

const downhill = Maybe.fromResult(
  Result.from<number>(3).map((n) => n * 2).result,
).map((n) => `${n}`).value
console.log('  Result -> Maybe:', downhill)

// Taking the other Box as a PARAMETER is free — a type-only import.
const viaBox = Result.fromBox(
  missing,
  Maybe.from(3).map((n) => n * 2),
).result
console.log('  Maybe -> Result, Box as a parameter:', viaBox)

if (uphill !== '6') throw new Error('expected "6"')
if (downhill !== '6') throw new Error('expected "6"')
if (viaBox !== 6) throw new Error('expected 6')
