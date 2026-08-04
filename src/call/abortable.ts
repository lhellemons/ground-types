import type { AbortableCall, Call } from './types.js'
import { AbortablePromise } from '../promise/index.js'

/**
 * Lifts any {@link Call} into an {@link AbortableCall}, so its caller holds a
 * handle it can cancel. Whatever the Call returns — a value, a plain Promise,
 * or an AbortablePromise — comes back as an AbortablePromise.
 *
 * How much that handle is worth depends on what the Call already returned. A
 * Call that returns an AbortablePromise is passed through untouched, so
 * aborting really cancels its work. A Call that returns a plain Promise is
 * wrapped, and a wrapper is all the abort can reach: aborting rejects the
 * handle with an `AbortError` while the underlying work runs to completion,
 * unobserved. Reach for this to make a Call's *interface* uniform, and give
 * the Call itself an `AbortSignal` if the work must actually stop.
 *
 * A Call that throws synchronously is caught and reported as a rejection, so
 * the returned AbortablePromise is one the declared type can be trusted for:
 * an AbortableCall never throws at the call site.
 */
export function abortable<O = void, I = void>(
  call: Call<O, I>,
): AbortableCall<O, I> {
  return (input: I) => {
    try {
      return AbortablePromise.of(call(input))
    } catch (error) {
      // A synchronous throw becomes a rejection with the value thrown, verbatim
      // — wrapping a non-Error here would pre-empt `resultify`, which is where
      // this library decides how a non-Error becomes a `Failure`.
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      return AbortablePromise.reject<O>(error)
    }
  }
}
