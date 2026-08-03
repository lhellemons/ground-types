import type { AbortableCall, Call } from './types.js'
import { AbortablePromise } from '../promise/index.js'

/**
 * abortable turns any Call into an AbortableCall by intercepting its result.
 * Note
 * @param call
 */
export function abortable<O = void, I = void>(
  call: Call<O, I>,
): AbortableCall<O, I> {
  return (input: I) => AbortablePromise.of(call(input))
}
