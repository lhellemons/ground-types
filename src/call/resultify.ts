import { curry } from '../fn/index.js'
import type { CurryableMapper, Mapper } from '../fn/index.js'
import type { Result } from '../result/index.js'
import type { AsyncCall, Call } from './types.js'
import { resultify as resultifyPromise } from '../promise/index.js'

/**
 * Lifts a {@link Call} that can fail into one that never rejects, resolving
 * with a {@link Result} instead. A resolution becomes a `Success` carrying the
 * value; a failure is passed to `mapRejection`, which decides what Result to
 * resolve with — `promise/fail` to report it as a `Failure`, or
 * `promise/recoverWith` to substitute a default.
 *
 * A Call may settle synchronously, so it may also fail synchronously. A
 * synchronous throw is routed to `mapRejection` exactly as a rejection is, so
 * the lifted Call's promise holds however the Call it lifts chose to fail.
 *
 * The same idea as `promise/resultify`, one level up: that one lifts a
 * settled-or-rejecting promise, this one lifts the function that produces it,
 * so the lifted Call can still be invoked with its input.
 *
 * The result is an {@link AsyncCall} rather than a `Call`: this lift builds a
 * promise whatever it was handed, including for a Call that settled
 * synchronously, so saying `O | Promise<O>` would declare a union whose left
 * branch can never occur and leave every caller to collapse it.
 *
 * That promise is a plain one, so the lifted Call is not cancellable even when
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
  call: Call<O, I>,
): AsyncCall<Result<O, E>, I>
export function resultify<O = void, E extends Error = Error, I = void>(
  mapRejection: Mapper<unknown, Result<O, E>>,
): Mapper<Call<O, I>, AsyncCall<Result<O, E>, I>>
export function resultify<O = void, E extends Error = Error, I = void>(
  mapRejection: Mapper<unknown, Result<O, E>>,
  ...call: [] | [Call<O, I>]
): CurryableMapper<Call<O, I>, AsyncCall<Result<O, E>, I>> {
  const mapper = (call: Call<O, I>): AsyncCall<Result<O, E>, I> => {
    return (input: I) =>
      resultifyPromise<O, E>(mapRejection, invoke(call, input))
  }

  return curry(mapper, ...call)
}

/**
 * Invokes a Call and normalises everything it can do into one `Promise<O>`.
 * The Promise constructor does all three jobs at once: `resolve` adopts a
 * returned promise and wraps a returned value — which is exactly the
 * `O | Promise<O>` a Call may return — and an executor that throws rejects the
 * promise it was building, which is what turns a synchronous failure into a
 * rejection the single `mapRejection` above can handle.
 */
function invoke<O, I>(call: Call<O, I>, input: I): Promise<O> {
  return new Promise<O>((resolve) => resolve(call(input)))
}
