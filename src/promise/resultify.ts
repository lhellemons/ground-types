import { failure, success } from '../result/index.js'
import type { Failure, Result } from '../result/index.js'
import { curry } from '../fn/index.js'
import type { CurryableMapper, Mapper } from '../fn/index.js'
import { RejectionError } from './types.js'

/**
 * resultify maps a promise that can reject with an arbitrary reason
 * to a promise that will never reject, but always resolve with a Result.
 * It needs a mapper that will map a rejection of the original promise to a Result.
 *
 * Two common strategies for mapping rejections are to
 * - produce a Failure from the rejection, or to
 * - ignore the rejection and "recover" with some default Result.
 * For these cases, the `fail` and `recoverWith` mappers are provided.
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
      promise
        .then(success as Mapper<O, Result<O, E>>, mapRejection)
        .catch(mapRejection),
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
 * `resultify` for a promise of any `O`. Pinning that type to `Error` would
 * make `resultify(fail, promise)` infer `Promise<Result<Error, Error>>`.
 */
export function fail<O = never>(reason: unknown): Result<O, Error> {
  return failure<O, Error>(
    reason instanceof Error ? reason : new RejectionError(reason),
  )
}

/**
 * recoverWith returns a mapper that maps any rejection reason to a predetermined Result.
 * @param result
 */
export function recoverWith<O, E extends Error>(
  result: Result<O, E>,
): Mapper<unknown, Result<O, E>> {
  return (_: unknown) => result
}
