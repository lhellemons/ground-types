/**
 * PROTOTYPE — throwaway. A consumer entering the cycle from `maybe/box`.
 * Run by `run.mjs`; prints, and throws if a claim fails.
 */
import { Maybe } from './maybe-box.js'
import { Result } from './result-box.js'

const missing = new Error('missing')

const justToSuccess = Maybe.from(3)
  .map((n) => n * 2)
  .toResult(missing)
console.log('  Just -> Success:', justToSuccess.result)

const nothingToFailure = Maybe.from<number>(undefined).toResult(missing)
console.log('  Nothing -> Failure:', nothingToFailure.result)

const roundTrip = Result.from<string>('hello').toMaybe().value
console.log('  Success -> Just:', roundTrip)

const failureToNothing = Result.from<string>(missing).toMaybe().value
console.log('  Failure -> Nothing:', failureToNothing)

console.log(
  '  instanceof across the cycle:',
  justToSuccess instanceof Result,
  nothingToFailure.result instanceof Error,
)

if (justToSuccess.result !== 6) throw new Error('expected 6')
if (nothingToFailure.result !== missing) throw new Error('expected the error')
if (roundTrip !== 'hello') throw new Error('expected hello')
if (failureToNothing !== undefined) throw new Error('expected undefined')
if (!(justToSuccess instanceof Result)) throw new Error('instanceof broke')
