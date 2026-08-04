/**
 * PROTOTYPE — throwaway. A consumer of variant C, importing each class from
 * its own subpath as a real consumer would.
 */
import { Maybe } from './maybe-box.js'
import { Result } from './result-box.js'

const missing = new Error('missing')

const crossed = Maybe.from(3)
  .map((n) => n * 2)
  .toResult(missing)
  .toMaybe()
  .map((n) => `${n}`)

console.log('  Maybe -> Result -> Maybe:', crossed.value)
console.log('  eager cross-class static:', Result.EMPTY.value)

if (crossed.value !== '6') throw new Error('expected "6"')
