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
 *
 * A Call reports failure by rejecting, not by throwing: `call/resultify` and
 * `call/abortable` both turn a synchronous throw into a rejection, so a Call
 * that throws is not a hole, but it is the less direct road.
 *
 * Type parameters are output-first, unlike `fn/Mapper`: `Call<Widget>` reads
 * as "produces a Widget, takes nothing" — the common shape.
 * `call/resultify` orders its parameters `<O, E, I>` to match.
 */
export type Call<O = void, I = void> = (input: I) => O | Promise<O>

/**
 * A {@link Call} that always returns a Promise, so its caller never has to
 * ask whether this one settled synchronously. What `call/resultify` returns
 * (see CONTEXT.md's Call entry).
 */
export type AsyncCall<O = void, I = void> = (input: I) => Promise<O>

/**
 * An {@link AsyncCall} whose promise is abortable, so its caller can cancel
 * the work it started. `call/abortable` lifts any Call into one.
 */
export type AbortableCall<O = void, I = void> = (
  input: I,
) => AbortablePromise<O>
