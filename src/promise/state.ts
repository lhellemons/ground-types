import { nothing } from '../maybe/index.js'
import type { Maybe } from '../maybe/index.js'
import { success } from '../result/index.js'
import type { Result } from '../result/index.js'
import { fail } from './resultify.js'

/** An operation that has not been started. */
export type Initial = { status: 'initial' }

/** An operation that has been started and has not settled. */
export type Pending = { status: 'pending' }

/** An operation that produced a value. */
export type Fulfilled<O> = { status: 'fulfilled'; value: O }

/**
 * An operation that failed. `reason` is unbounded because that is what a
 * promise rejection actually gives you; {@link settledResult} is what narrows
 * it to an `Error`.
 */
export type Rejected = { status: 'rejected'; reason: unknown }

/** An operation that has finished, one way or the other. */
export type Settled<O> = Fulfilled<O> | Rejected

/**
 * Where an asynchronous operation currently is: not yet started, running, or
 * settled one way or the other.
 *
 * `State` is about time; `Result` is about outcome. Only `State` has a case
 * for an operation that has not finished, and only `Result` guarantees an
 * `Error` in its failing case. {@link settledResult} bridges the two.
 *
 * Unlike `Maybe` and `Result`, `State` is boxed. Four cases cannot be
 * discriminated by a primitive check on an unboxed value, so there is nothing
 * to be gained by pretending otherwise.
 */
export type State<O> = Initial | Pending | Settled<O>

/** The state of an operation that has not been started. */
export function initial(): Initial {
  return { status: 'initial' }
}

/** The state of an operation that is running. */
export function pending(): Pending {
  return { status: 'pending' }
}

/** The state of an operation that produced `value`. */
export function fulfilled<O>(value: O): Fulfilled<O> {
  return { status: 'fulfilled', value }
}

/** The state of an operation that failed with `reason`. */
export function rejected(reason: unknown): Rejected {
  return { status: 'rejected', reason }
}

/** Type guard: true when the operation has not been started. */
export function isInitial<O>(state: State<O>): state is Initial {
  return state.status === 'initial'
}

/** Type guard: true when the operation is running. */
export function isPending<O>(state: State<O>): state is Pending {
  return state.status === 'pending'
}

/** Type guard: true when the operation produced a value. */
export function isFulfilled<O>(state: State<O>): state is Fulfilled<O> {
  return state.status === 'fulfilled'
}

/** Type guard: true when the operation failed. */
export function isRejected<O>(state: State<O>): state is Rejected {
  return state.status === 'rejected'
}

/**
 * Type guard: true when the operation has finished, either way. The
 * distinction {@link settledResult} turns on.
 */
export function isSettled<O>(state: State<O>): state is Settled<O> {
  return isFulfilled(state) || isRejected(state)
}

/**
 * Bridges `State` to `Result`: `Nothing` while the operation has not finished,
 * and the outcome as a `Result` once it has. A rejection reason is narrowed to
 * an `Error` by {@link fail}, keeping its concrete subclass — so an abort
 * arrives as an `AbortError`.
 *
 * The `Maybe` is the honest part. A `Result` answers how something ended, and
 * an operation still running has not ended, so there is no `Result` to give.
 *
 * With one exception, which the unboxed encoding cannot close: when `O`
 * includes `undefined` or `void` — as it does for every Call that performs an
 * action rather than producing data, since `Call`'s output defaults to `void` —
 * a fulfilled `Success` *is* `undefined`, and `Nothing` is `undefined` too. The
 * two are the same value, so a finished action is indistinguishable here from
 * one still running. Branch on {@link isSettled} first when `O` can be absent;
 * this bridge is for operations that produce something.
 */
export function settledResult<O>(state: State<O>): Maybe<Result<O, Error>> {
  if (!isSettled(state)) {
    return nothing()
  }

  // Cast for the same reason `maybe/fromResult` casts: `Maybe<T>` is a
  // conditional type, and with `O` still an unresolved type parameter it
  // cannot be evaluated, so assignment into it is checked conservatively.
  return (
    isFulfilled(state) ? success<O, Error>(state.value) : fail<O>(state.reason)
  ) as Maybe<Result<O, Error>>
}

/** A live view of a promise's {@link State}, as produced by {@link stateOf}. */
export interface TrackedState<O> {
  readonly current: State<O>
}

/**
 * Tracks a promise's {@link State}, so it can be read synchronously at any
 * moment: `pending` until the promise settles, then `fulfilled` or `rejected`.
 * Never `initial` — a promise you are holding has already been started.
 *
 * ```ts
 * const tracked = stateOf(fetchWidget())
 * tracked.current // { status: 'pending' }
 * ```
 *
 * Observing a promise means attaching handlers to it, which marks it handled.
 * If nothing else consumes `promise`, a rejection will no longer be reported
 * as unhandled — so track promises you are also going to await, not ones you
 * are dropping.
 */
export function stateOf<O>(promise: Promise<O>): TrackedState<O> {
  let state: State<O> = pending()

  promise.then(
    (value) => {
      state = fulfilled(value)
    },
    (reason: unknown) => {
      state = rejected(reason)
    },
  )

  return {
    get current() {
      return state
    },
  }
}
