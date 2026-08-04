/**
 * PROTOTYPE — throwaway. The same consumer, entering the cycle from the other
 * side. Module evaluation order is the variable under test.
 */
import { Result } from './result-box.js'
import { Maybe } from './maybe-box.js'

const missing = new Error('missing')

const backAndForth = Result.from<number>(4)
  .toMaybe()
  .map((n) => n + 1)
  .toResult(missing)

console.log('  result-first round trip:', backAndForth.result)
console.log('  Maybe reachable:', typeof Maybe.from(1).value)

if (backAndForth.result !== 5) throw new Error('expected 5')
