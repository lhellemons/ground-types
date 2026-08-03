import { failure, Failure, Result, success } from "../result";
import { curry, CurryableMapper, Mapper } from "../mapper";
import { RejectionError } from "./types";

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
  promise: Promise<O>
): Promise<Result<O, E>>;
export function resultify<O, E extends Error>(
  mapRejection: Mapper<unknown, Result<O, E>>
): Mapper<Promise<O>, Promise<Result<O, E>>>;
export function resultify<O, E extends Error>(
  mapRejection: Mapper<unknown, Result<O, E>>,
  promise?: Promise<O>
): CurryableMapper<Promise<O>, Promise<Result<O, E>>> {
  return curry(
    (promise: Promise<O>): Promise<Result<O, E>> =>
      promise.then(success as Mapper<O, Result<O, E>>, mapRejection).catch(mapRejection),
    promise
  );
}

/**
 * fail maps any rejection reason to a Failure.
 * If the rejection reason is an Error, the Failure will contain that Error directly.
 * Otherwise, the Failure will contain a RejectionError that contains the reason
 * @param reason
 */
export const fail = (reason: unknown): Failure<Error> =>
  failure(reason instanceof Error ? reason : new RejectionError(reason));

/**
 * recoverWith returns a mapper that maps any rejection reason to a predetermined Result.
 * @param result
 */
export function recoverWith<O, E extends Error>(
  result: Result<O, E>
): Mapper<unknown, Result<O, E>> {
  return (_: unknown) => result;
}
