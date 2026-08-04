/**
 * PROTOTYPE — throwaway. A consumer of variant D, showing both what the one
 * surviving direction buys and what the missing one costs.
 */
import { Maybe } from './maybe-box.js'
import { Result } from './result-box.js'

const missing = new Error('missing')

// Downhill: Result -> Maybe stays inside the chain.
const downhill = Result.from<number>(3)
  .map((n) => n * 2)
  .toMaybe()
  .map((n) => `${n}`).value
console.log('  Result -> Maybe, in-chain:', downhill)

// Uphill: Maybe -> Result must leave the chain and re-enter through a static.
const uphill = Result.fromMaybe(
  missing,
  Maybe.from(3).map((n) => n * 2).value,
).result
console.log('  Maybe -> Result, via exit and re-enter:', uphill)

if (downhill !== '6') throw new Error('expected "6"')
if (uphill !== 6) throw new Error('expected 6')
