import type { CurryableMapper, Mapper } from '../fn/index.js'
import type { Result } from '../result/index.js'
import type { Call } from './types.js'
import { resultify } from '../promise/index.js'

/**
 * resultifyCall transforms a Call that can reject into a call that will never reject.
 * Instead, the Call will resolve with a Result.
 * If the original call resolves, the new call will resolve with a Success containing its resolved value.
 * On rejection, mapRejection will be called to transform the reject reason into a Result.
 *
 * @see resultify
 */
export function resultifyCall<E extends Error = Error, O = void, I = void>(
  mapRejection: Mapper<unknown, Result<O, E>>,
): Mapper<Call<O, I>, Call<Result<O, E>, I>>
export function resultifyCall<E extends Error, O = void, I = void>(
  mapRejection: Mapper<unknown, Result<O, E>>,
  call: Call<O, I>,
): Call<Result<O, E>, I>
export function resultifyCall<E extends Error, O = void, I = void>(
  mapRejection: Mapper<unknown, Result<O, E>>,
  call?: Call<O, I>,
): CurryableMapper<Call<O, I>, Call<Result<O, E>, I>> {
  const mapper = (call: Call<O, I>): Call<Result<O, E>, I> => {
    return (input: I) => resultify<O, E>(mapRejection, asPromise(call(input)))
  }

  return call !== undefined ? mapper(call) : mapper
}

function asPromise<T>(t: T | Promise<T>): Promise<T> {
  return t instanceof Promise ? t : Promise.resolve(t)
}
