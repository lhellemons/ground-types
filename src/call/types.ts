// Type-only: AbortablePromise is a class, so an ordinary import would emit a
// runtime import of the whole promise module from a file that declares nothing
// but types.
import type { AbortablePromise } from '../promise/index.js'

/**
 * A function that performs an action, produces data, or both. A Call may take
 * an input or not, may produce an output or not, and may settle synchronously
 * or asynchronously.
 *
 * A Call is the thing you invoke, not the work in flight — that is an
 * {@link AbortablePromise}.
 */
export type Call<O = void, I = void> = (input: I) => O | Promise<O>

/**
 * A {@link Call} that always returns an {@link AbortablePromise}, so its
 * caller can cancel the work it started. `call/abortable` lifts any Call into
 * one.
 */
export type AbortableCall<O = void, I = void> = (
  input: I,
) => AbortablePromise<O>
