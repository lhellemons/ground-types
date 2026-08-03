import { AbortablePromise } from '../promise/index.js'

/**
 * Call models a function that performs some action and/or returns some data.
 * Calls can take input or not, produce output or not, and operate
 * synchronously or asynchronously.
 */
export type Call<O = void, I = void> = (input: I) => O | Promise<O>
/**
 * AbortableCall is a Call that always returns an AbortablePromise
 */
export type AbortableCall<O = void, I = void> = (
  input: I,
) => AbortablePromise<O>
