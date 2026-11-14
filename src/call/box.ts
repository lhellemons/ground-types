/* The class is declared privately and exported as a value binding only, so
   the instance type has no spellable name: `Call` in type position resolves
   to the unboxed alias below. Only `export const` plus a locally declared
   type alias produces that split — the tidier-looking matched export
   clauses fail, and fail in the direction that hands the *class* the type
   meaning. See docs/adr/0005-box-classes.md. */

import type { AbortableCall, AsyncCall } from './index.js'
import type { Mapper } from '../fn/index.js'
import type { AbortablePromise } from '../promise/index.js'
import type { Result } from '../result/index.js'

/**
 * The unboxed type, under the capitalised name: `Call` written in type
 * position is `./index.js`'s `Call`, never the Box. One name, both
 * meanings — the class below in value position, this alias in type
 * position.
 */
export type Call<O = void, I = void> = import('./index.js').Call<O, I>

/** Any Call at all — the constraint a boxed subject must satisfy. */
type AnyCall = (input: never) => unknown

/** The held Call's output, whichever way it settles. */
type OutputOf<R extends AnyCall> = Awaited<ReturnType<R>>

/** The held Call's input. */
type InputOf<R extends AnyCall> = Parameters<R>[0]

/**
 * Closes the order that would silently discard an abort handle, surfacing
 * the diagnostic as a readable string: `resultify` builds its own plain
 * promise, so lifting an already-abortable Call would leave its caller no
 * handle to abort — invoke the Call and lift its promise with
 * `promise/resultify` instead. Exported so its exact wording can be pinned
 * by type-level tests, like `NotAResult`/`NotAPromise`.
 */
export type NotAbortable<R extends AnyCall> =
  ReturnType<R> extends AbortablePromise<unknown>
    ? 'This Call is already abortable — resultify would discard the abort handle; invoke it and lift its promise with promise/resultify instead'
    : unknown

/** Every member throws: the surface is pinned ahead of its implementation. */
function notImplemented(..._args: unknown[]): never {
  throw new Error(
    'Not implemented — the Box surface is pinned, not built; see docs/adr/0005-box-classes.md',
  )
}

/**
 * The Call Box: a transient chain builder over a `Call` (see CONTEXT.md's
 * Box entry). Enter through the static factory, lift with
 * {@link resultify} and {@link abortable} — in that order; the other is a
 * compile error (see {@link NotAbortable}) — and leave through a
 * terminal: `unbox()`, `.call`, or `invoke(input)`, which terminates by
 * running the held Call. Invoking hands you the existing async API — the
 * work in flight is an `AbortablePromise`, already chainable — so the Box
 * layer stops here (docs/adr/0005-box-classes.md). To adapt a Call's
 * input, compose it as an `Fn` and re-enter through {@link from}.
 */
class CallBox<R extends AnyCall> {
  private constructor() {
    /* Instances come only from the static factory. */
  }

  /** Boxes a Call — synchronous-settling, asynchronous, or abortable. */
  static from<C extends AnyCall>(call: C): CallBox<C> {
    return notImplemented(call)
  }

  /**
   * Lifts the held Call into an `AbortableCall` — the counterpart of
   * `call/abortable`, so the caller of the lifted Call can cancel the work
   * it starts.
   */
  abortable(): CallBox<AbortableCall<OutputOf<R>, InputOf<R>>> {
    return notImplemented()
  }

  /**
   * Lifts the held Call into an `AsyncCall` that never rejects, resolving
   * with a `Result` instead — the counterpart of `call/resultify`.
   * `mapRejection` decides what the lifted Call resolves with on failure:
   * `promise/fail` to report a `Failure`, `promise/recoverWith` to
   * substitute a default. Not applicable to an already-abortable Call
   * (see {@link NotAbortable}) — lift to a `Result` first, then wrap for
   * a handle.
   */
  resultify<E extends Error = Error>(
    mapRejection: Mapper<unknown, Result<OutputOf<R>, E>> & NotAbortable<R>,
  ): CallBox<AsyncCall<Result<OutputOf<R>, E>, InputOf<R>>> {
    return notImplemented(mapRejection)
  }

  /** Terminal: runs the held Call with its input. */
  invoke(input: InputOf<R>): ReturnType<R> {
    return notImplemented(input)
  }

  /** Terminal: hands back the held Call. */
  unbox(): R
  /**
   * Terminal, folding: applies `fn` to the held Call and hands back its
   * result. `unbox(undefined)` is an argument, not a zero-arg call
   * (docs/adr/0003-currying.md), and a compile error.
   */
  unbox<U>(fn: (call: R) => U): U
  unbox<U>(fn?: (call: R) => U): R | U {
    return notImplemented(fn)
  }

  /** Terminal: the held Call, as a property read. */
  get call(): R {
    return notImplemented()
  }
}

export const Call = CallBox
