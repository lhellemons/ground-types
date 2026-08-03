import { curry } from '../fn/index.js'
import type { CurryableMapper, Mapper } from '../fn/index.js'
import type { Result } from '../result/index.js'
import type { Call } from './types.js'
import { resultify as resultifyPromise } from '../promise/index.js'

/**
 * Lifts a {@link Call} that can reject into one that never rejects, resolving
 * with a {@link Result} instead. A resolution becomes a `Success` carrying the
 * value; a rejection is passed to `mapRejection`, which decides what Result to
 * resolve with — `promise/fail` to report it as a `Failure`, or
 * `promise/recoverWith` to substitute a default.
 *
 * The same idea as `promise/resultify`, one level up: that one lifts a
 * settled-or-rejecting promise, this one lifts the function that produces it,
 * so the lifted Call can still be invoked with its input.
 *
 * The lifted Call returns a plain Promise, so it is not cancellable even when
 * the Call it lifts is: the AbortablePromise is created inside, leaving the
 * caller no handle to abort. Keep both by lifting at the point of use —
 * `const p = call(input)`, then `promise/resultify(fail, p)`, then `p.abort()`.
 *
 * Curryable: supply `call` to lift it immediately, or omit it for a Mapper
 * that lifts any Call.
 *
 * Type parameters are ordered `<O, E, I>` so that the two shared with
 * `promise/resultify<O, E>` keep their positions.
 */
export function resultify<O = void, E extends Error = Error, I = void>(
  mapRejection: Mapper<unknown, Result<O, E>>,
): Mapper<Call<O, I>, Call<Result<O, E>, I>>
export function resultify<O = void, E extends Error = Error, I = void>(
  mapRejection: Mapper<unknown, Result<O, E>>,
  call: Call<O, I>,
): Call<Result<O, E>, I>
export function resultify<O = void, E extends Error = Error, I = void>(
  mapRejection: Mapper<unknown, Result<O, E>>,
  ...call: [] | [Call<O, I>]
): CurryableMapper<Call<O, I>, Call<Result<O, E>, I>> {
  const mapper = (call: Call<O, I>): Call<Result<O, E>, I> => {
    return (input: I) =>
      resultifyPromise<O, E>(mapRejection, asPromise(call(input)))
  }

  return curry(mapper, ...call)
}

/** Normalises a Call's possibly-synchronous return into a Promise. */
function asPromise<T>(t: T | Promise<T>): Promise<T> {
  return t instanceof Promise ? t : Promise.resolve(t)
}
