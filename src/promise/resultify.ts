import { failure, success } from '../result/index.js'
import type { Result } from '../result/index.js'
import { constant, curry } from '../fn/index.js'
import type { CurryableMapper, Mapper } from '../fn/index.js'
import { RejectionError } from './types.js'

/**
 * Lifts a promise that may reject into one that never rejects, resolving with
 * a {@link Result} instead. A resolution becomes a `Success`; a rejection goes
 * to `mapRejection`, which decides what Result to resolve with — {@link fail}
 * to report it as a `Failure`, {@link recoverWith} to substitute a default.
 *
 * The lifted promise is a plain `Promise`, never an `AbortablePromise`, even
 * when the promise it lifts is one — one abortable handle, so abort has one
 * meaning. Hold the source, lift where you consume it, and abort the source:
 *
 * ```ts
 * const widget = fetchWidget()          // AbortablePromise<Widget>
 * const lifted = resultify(fail, widget) // Promise<Result<Widget>>
 * widget.abort()                        // lifted resolves with a Failure
 * ```
 *
 * Curryable: supply `promise` to lift it now, or omit it for a Mapper.
 *
 * @see fail
 * @see recoverWith
 */
export function resultify<O, E extends Error>(
  mapRejection: Mapper<unknown, Result<O, E>>,
  promise: Promise<O>,
): Promise<Result<O, E>>
export function resultify<O, E extends Error>(
  mapRejection: Mapper<unknown, Result<O, E>>,
): Mapper<Promise<O>, Promise<Result<O, E>>>
export function resultify<O, E extends Error>(
  mapRejection: Mapper<unknown, Result<O, E>>,
  ...promise: [] | [Promise<O>]
): CurryableMapper<Promise<O>, Promise<Result<O, E>>> {
  return curry(
    (promise: Promise<O>): Promise<Result<O, E>> =>
      // Promise.resolve returns its argument only when the argument's
      // constructor is Promise itself, so a subclass instance is wrapped —
      // which is exactly how the lifted promise is stripped of abortability.
      // No trailing .catch(mapRejection): `success` is a cast and cannot
      // throw, so the only thing it could catch is mapRejection failing,
      // and handing a handler its own failure is not a recovery strategy.
      Promise.resolve(promise).then(
        success as Mapper<O, Result<O, E>>,
        mapRejection,
      ),
    ...promise,
  )
}

/**
 * Maps any rejection reason to a {@link Failure}. An `Error` becomes the
 * Failure directly, keeping its concrete subclass — which is what lets an
 * abort survive as an `AbortError` rather than being flattened. Anything else
 * is wrapped in a {@link RejectionError}, since a Failure must carry an Error.
 *
 * Generic in the success type it never produces, so that it can be handed to
 * `resultify` for a promise of any `O`.
 */
export function fail<O = never>(reason: unknown): Result<O, Error> {
  return failure<Error, O>(
    reason instanceof Error ? reason : new RejectionError(reason),
  )
}

/**
 * Discards the rejection reason and substitutes a predetermined
 * {@link Result}. The counterpart to {@link fail}: where `fail` reports what
 * went wrong, this decides the outcome regardless. Behaviourally it is
 * `fn/constant` with a narrower type.
 */
export function recoverWith<O, E extends Error>(
  result: Result<O, E>,
): Mapper<unknown, Result<O, E>> {
  return constant(result)
}
