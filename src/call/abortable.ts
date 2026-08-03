import { AbortableCall, Call } from "./types";
import { AbortablePromise } from "../promise";

/**
 * abortable turns any Call into an AbortableCall by intercepting its result.
 * Note
 * @param call
 */
export function abortable<O = void, I = void>(call: Call<O, I>): AbortableCall<O, I> {
  return (input: I) => AbortablePromise.of(call(input));
}
