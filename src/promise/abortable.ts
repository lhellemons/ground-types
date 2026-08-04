import { AbortError } from '../abort/index.js'

/**
 * What an {@link AbortablePromise}'s executor receives as its third argument,
 * so it can react to the promise being aborted.
 *
 * `signal` is realised lazily: the underlying `AbortController` is allocated
 * the first time something reads it, and never for a promise whose executor
 * does not care (see docs/adr/0002-abort-propagation.md). Reading it always
 * yields the same real `AbortSignal`, so `instanceof` and every platform API
 * that takes one still work.
 */
export interface AbortContext {
  readonly signal: AbortSignal
}

/**
 * The abort machinery for one {@link AbortablePromise}, kept in its own object
 * so that it exists before `super()` is called and can therefore be reached
 * from inside the Promise executor.
 *
 * This object is handed to the executor as its {@link AbortContext}; the
 * context type exposes only `signal`, so the rest of this surface is not
 * reachable through it in TypeScript.
 */
class AbortState {
  #controller?: AbortController
  #rejectSelf?: (reason?: unknown) => void
  #settled = false
  #aborted = false
  #linked: Array<() => void> = []
  #releases: Array<() => void> = []

  constructor(controller?: AbortController) {
    this.#controller = controller
  }

  get signal(): AbortSignal {
    return this.#ensureController().signal
  }

  /** Forces a controller into existence, for sharing with a peer. */
  get sharedController(): AbortController {
    return this.#ensureController()
  }

  get startedAborted(): boolean {
    return this.#controller?.signal.aborted === true
  }

  #ensureController(): AbortController {
    if (!this.#controller) {
      this.#controller = new AbortController()
      if (this.#aborted) {
        this.#controller.abort()
      } else {
        this.watchController()
      }
    }
    return this.#controller
  }

  /**
   * Reacts to the controller being aborted directly rather than through
   * {@link abort} — which is how an externally supplied controller, or a peer
   * sharing this one, reaches this promise.
   */
  watchController(): void {
    if (this.#controller) {
      this.watchSignal(this.#controller.signal)
    }
  }

  /**
   * Aborts this promise when `signal` fires, and stops listening once this
   * promise settles — whichever comes first. Releasing from inside the
   * settlement bookkeeping is what keeps the promise's handled-ness
   * untouched; see docs/adr/0002-abort-propagation.md.
   */
  watchSignal(signal: AbortSignal): void {
    if (signal.aborted) {
      this.abort()
      return
    }

    const onAbort = () => this.abort()
    signal.addEventListener('abort', onAbort, { once: true })
    this.#releases.push(() => {
      signal.removeEventListener('abort', onAbort)
    })
  }

  /** Stops listening to every signal this promise was bound to. */
  #release(): void {
    for (const release of this.#releases) {
      release()
    }
    this.#releases.length = 0
  }

  captureReject(reject: (reason?: unknown) => void): void {
    this.#rejectSelf = reject
  }

  /** True when this call is the one that settles the promise. */
  claimSettlement(): boolean {
    if (this.#settled) {
      return false
    }
    this.#settled = true
    // A settled promise can never fire its upstream links, since `abort`
    // returns early once `#settled`. Dropping them here releases the chain a
    // retained tail would otherwise keep reachable all the way to its head.
    this.#linked.length = 0
    // Same reasoning one step out: a settled promise can no longer be aborted,
    // so every signal it is bound to is now listening for nothing.
    this.#release()
    return true
  }

  /**
   * Registers a callback for when this promise is aborted. Used for the
   * upstream link from a derived promise to its source, in place of a
   * listener on a signal — so linking never forces a controller into
   * existence. A link registered after the abort has already happened fires
   * at once (see docs/adr/0002-abort-propagation.md).
   */
  link(onAbort: () => void): void {
    if (this.#aborted) {
      onAbort()
      return
    }
    this.#linked.push(onAbort)
  }

  abort(): void {
    if (this.#aborted || this.#settled) {
      return
    }
    this.#aborted = true
    this.#settled = true

    // Fire the platform signal before rejecting, so an executor watching it
    // can release resources before the rejection propagates. Re-entry through
    // watchController is harmless: #aborted is already set.
    this.#controller?.abort()
    this.#rejectSelf?.(new AbortError('AbortablePromise aborted'))

    for (const onAbort of this.#linked) {
      onAbort()
    }
    this.#linked.length = 0
    // Last, so that a signal firing into this call has already been handled by
    // the listener that is about to be removed.
    this.#release()
  }
}

/**
 * True when `value` is a thenable, and so something a promise resolves *to*
 * rather than settles *with* — the same test the promise resolution
 * procedure makes.
 */
function isThenable<T>(value: T | PromiseLike<T>): value is PromiseLike<T> {
  return (
    value !== null &&
    (typeof value === 'object' || typeof value === 'function') &&
    typeof (value as PromiseLike<T>).then === 'function'
  )
}

/**
 * An AbortablePromise is a Promise that can be aborted at any point prior to
 * settling, by calling its {@link AbortablePromise.abort} method. An aborted
 * AbortablePromise rejects with an {@link AbortError}. Aborting one that has
 * already fulfilled or rejected has no effect, and neither does aborting the
 * same one more than once.
 *
 * Resolving with a promise is not settling. An executor that delegates —
 * `new AbortablePromise((resolve) => resolve(fetchThing()))` — stays abortable
 * until the promise it delegated to settles.
 *
 * The executor can react to the abort through the {@link AbortContext} it
 * receives as a third argument.
 *
 * Abort propagates *upstream*: aborting a promise returned by `then`, `catch`
 * or `finally` also aborts the promise it derived from, so a chain aborts as
 * one unit and cancelling the tail really does cancel the work at the head.
 * Delegation is upstream too — aborting the outer promise in
 * `new AbortablePromise((resolve) => resolve(work()))` aborts `work()` when
 * `work()` returned an AbortablePromise. A delegate that is a plain Promise
 * is left alone; there is nothing on it to abort.
 * The consequence to know about is that two chains branched off one source
 * share that source, so aborting either branch aborts the other. Use
 * {@link AbortablePromise.detach} at the branch point when that is not what
 * you want — including at a delegation, where `resolve(work().detach())`
 * hands over the outcome without handing over the right to cancel. See
 * docs/adr/0002-abort-propagation.md.
 *
 * **An abort is a rejection, and an unhandled rejection is fatal.** Node exits
 * non-zero on one by default, so aborting a promise nothing is awaiting kills
 * the process. The shapes that matter are already safe: a chain's head is
 * handled by the chain, and `all`, `race`, `any` and `allSettled` handle their
 * members. What is not safe is aborting a promise you are holding but not
 * consuming — see {@link AbortablePromise.abort},
 * {@link AbortablePromise.abortOn} and {@link AbortablePromise.peer}, each of
 * which can reach one. Attach a `catch` to anything you may abort without
 * awaiting.
 */
export class AbortablePromise<T> extends Promise<T> {
  /**
   * Wraps a regular Promise to make it abortable.
   *
   * Note that the wrapped Promise does not itself react to being aborted
   * unless it is already an AbortablePromise. Otherwise aborting only rejects
   * the wrapper; the underlying work runs to completion, unobserved.
   */
  static of<T>(source: T | Promise<T>): AbortablePromise<T> {
    if (source instanceof AbortablePromise) {
      return source
    }

    if (source instanceof Promise) {
      return new AbortablePromise<T>((resolve, reject) => {
        source.then(resolve).catch(reject)
      })
    }

    return new AbortablePromise<T>((resolve, reject) => {
      Promise.resolve(source).then(resolve).catch(reject)
    })
  }

  static reject<T = never>(reason?: unknown): AbortablePromise<T> {
    // Mirrors `Promise.reject`, whose reason is deliberately unconstrained.
    // Normalising a non-Error reason is `resultify`'s job, downstream of here.
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    return AbortablePromise.of(Promise.reject(reason))
  }

  static resolve(): AbortablePromise<void>
  static resolve<T>(value: T | PromiseLike<T>): AbortablePromise<Awaited<T>>
  static resolve<T>(
    value?: T | PromiseLike<T>,
  ): AbortablePromise<Awaited<T> | void> {
    return AbortablePromise.of(Promise.resolve(value))
  }

  /**
   * An AbortablePromise that has already been aborted.
   *
   * It is rejected the moment it exists, so a caller that drops it rather than
   * consuming it has produced an unhandled rejection — `AbortablePromise.abort()`
   * on a line of its own exits the process. Use it as a value something awaits:
   * a stub for an operation that was cancelled before it started, or the branch
   * of a factory that declines to do any work.
   */
  static abort<T = never>(): AbortablePromise<T> {
    const aborted = new AbortablePromise<T>(() => {})
    aborted.abort()
    return aborted
  }

  /**
   * Extends this class's upstream propagation to fan-in: aborting the
   * combined promise aborts every member that can be aborted. Members that
   * are plain Promises are skipped, and losers are *not* aborted when one
   * member settles first, including in `race` (see
   * docs/adr/0002-abort-propagation.md).
   */
  static #abortMembersWith(
    combined: AbortablePromise<unknown>,
    members: readonly unknown[],
  ): void {
    combined.#state.link(() => {
      for (const member of members) {
        if (member instanceof AbortablePromise) {
          member.abort()
        }
      }
    })
  }

  /**
   * Each combinator mirrors `Promise`'s own overload pair — a tuple form
   * that keeps each member's type in position, and an iterable form for a
   * homogeneous collection.
   */
  static all<T extends readonly unknown[] | []>(
    values: T,
  ): AbortablePromise<{ -readonly [P in keyof T]: Awaited<T[P]> }>
  static all<T>(
    values: Iterable<T | PromiseLike<T>>,
  ): AbortablePromise<Awaited<T>[]>
  static all(values: Iterable<unknown>): AbortablePromise<unknown> {
    const members = [...values]
    const combined = super.all(members) as AbortablePromise<unknown>
    AbortablePromise.#abortMembersWith(combined, members)
    return combined
  }

  static allSettled<T extends readonly unknown[] | []>(
    values: T,
  ): AbortablePromise<{
    -readonly [P in keyof T]: PromiseSettledResult<Awaited<T[P]>>
  }>
  static allSettled<T>(
    values: Iterable<T | PromiseLike<T>>,
  ): AbortablePromise<PromiseSettledResult<Awaited<T>>[]>
  static allSettled(values: Iterable<unknown>): AbortablePromise<unknown> {
    const members = [...values]
    const combined = super.allSettled(members) as AbortablePromise<unknown>
    AbortablePromise.#abortMembersWith(combined, members)
    return combined
  }

  static race<T extends readonly unknown[] | []>(
    values: T,
  ): AbortablePromise<Awaited<T[number]>>
  static race<T>(
    values: Iterable<T | PromiseLike<T>>,
  ): AbortablePromise<Awaited<T>>
  static race(values: Iterable<unknown>): AbortablePromise<unknown> {
    const members = [...values]
    const combined = super.race(members) as AbortablePromise<unknown>
    AbortablePromise.#abortMembersWith(combined, members)
    return combined
  }

  static any<T extends readonly unknown[] | []>(
    values: T,
  ): AbortablePromise<Awaited<T[number]>>
  static any<T>(
    values: Iterable<T | PromiseLike<T>>,
  ): AbortablePromise<Awaited<T>>
  static any(values: Iterable<unknown>): AbortablePromise<unknown> {
    const members = [...values]
    const combined = super.any(members) as AbortablePromise<unknown>
    AbortablePromise.#abortMembersWith(combined, members)
    return combined
  }

  readonly #state: AbortState

  /**
   * Creates a new AbortablePromise, which behaves exactly as a regular Promise
   * except that calling {@link AbortablePromise.abort} before it settles
   * rejects it with an {@link AbortError}.
   *
   * @param executor An executor callback as a regular Promise takes, with an
   * {@link AbortContext} passed as a third argument.
   * @param controller If given, this AbortablePromise is governed by that
   * controller rather than one of its own. Aborting the promise then aborts
   * the passed controller too, and so everything else it governs — which cuts
   * both ways: handing a controller in is handing over the right to reject
   * this promise from anywhere else that holds it. The listener this costs
   * on the controller's signal is removed when this promise settles, as
   * {@link AbortablePromise.abortOn}'s is.
   */
  constructor(
    executor: (
      resolve: (value: T | PromiseLike<T>) => void,
      reject: (reason?: unknown) => void,
      context: AbortContext,
    ) => void,
    controller?: AbortController,
  ) {
    // Built before super() so the executor below can reach it. Referencing a
    // local is allowed there; referencing `this` would not be.
    const state = new AbortState(controller)

    super((resolve, reject) => {
      state.captureReject(reject)

      if (state.startedAborted) {
        state.abort()
        return
      }
      state.watchController()

      executor(
        (value) => {
          if (isThenable(value)) {
            // Resolving with a thenable is not settling: the outcome has been
            // handed to that thenable, which may not settle for a long time or
            // at all. Claiming settlement here would make `abort()` a silent
            // no-op for the delegating shape this class exists for —
            // `new AbortablePromise((resolve) => resolve(fetchThing()))`. Adopt
            // it instead, and claim only when it really settles.
            // Bound to its own const because the `instanceof` below narrows
            // `value` to `AbortablePromise<any>`, and that `any` would leak
            // out through the adopted value's type.
            const adopted: PromiseLike<T> = value
            if (value instanceof AbortablePromise) {
              // Delegation is upstream, so abort travels it like any other
              // upstream link: the delegate is where the work actually is, and
              // rejecting only the outer promise would leave it running. The
              // adoption below has already attached handlers to the delegate,
              // so the rejection this causes is handled.
              state.link(() => value.abort())
            }
            Promise.resolve(adopted).then(
              (settledValue) => {
                if (state.claimSettlement()) {
                  resolve(settledValue)
                }
              },
              (reason: unknown) => {
                if (state.claimSettlement()) {
                  reject(reason)
                }
              },
            )
            return
          }

          if (state.claimSettlement()) {
            resolve(value)
          }
        },
        (reason) => {
          if (state.claimSettlement()) {
            reject(reason)
          }
        },
        state,
      )
    })

    this.#state = state
  }

  /**
   * Aborts this promise, rejecting it with an {@link AbortError} if it has not
   * already settled. Recognise the rejection with `abort/isAbortError` rather
   * than by identity — every abort constructs its own Error.
   */
  abort(): void {
    this.#state.abort()
  }

  /**
   * Binds this promise's lifetime to an external `AbortSignal`: aborting the
   * signal aborts this promise. Returns this promise, so it can be bound
   * inline.
   *
   * Binding is not consuming. When the signal fires, this promise rejects
   * wherever it happens to be, so a promise bound and then dropped is an
   * unhandled rejection waiting for the signal — fatal in Node. Bind promises
   * you go on to await or catch, not ones you start and forget.
   *
   * The listener is removed again when this promise settles, so binding many
   * short-lived promises to one long-lived signal does not accumulate
   * listeners on it — and no rejection handler is attached to do it, so this
   * promise's handled-ness is untouched.
   */
  abortOn(signal: AbortSignal): AbortablePromise<T> {
    this.#state.watchSignal(signal)
    return this
  }

  /**
   * Returns an AbortablePromise that settles exactly as this one does but owns
   * its abort lifetime: aborting it never touches this promise, so a chain
   * built on the result can be cancelled without cancelling the work it came
   * from. Abort still travels the other way — aborting this promise rejects
   * the detached one, as any rejection would.
   *
   * Reach for this at a branch point, where two consumers share one source and
   * neither should be able to cancel the other.
   */
  detach(): AbortablePromise<T> {
    // super.then bypasses this class's `then` override, constructing the
    // derived promise through the species constructor without the upstream
    // link that override adds.
    return super.then() as AbortablePromise<T>
  }

  /**
   * Creates a new AbortablePromise as a peer of this one. The peer shares this
   * promise's AbortController, so aborting either aborts both.
   *
   * Both, therefore, reject — and unlike a chain, neither is handled by the
   * other: peers are siblings, not links, so nothing attaches a handler on
   * your behalf. Aborting one while the other is unconsumed is an unhandled
   * rejection, and fatal in Node. Await or catch both, or reach for
   * {@link AbortablePromise.detach} if the two lifetimes should be separate
   * after all.
   *
   * Unlike `then`, this forces a controller into existence — sharing one is
   * what a peer is.
   */
  peer<U>(
    executor: (
      resolve: (value: U | PromiseLike<U>) => void,
      reject: (reason?: unknown) => void,
      context: AbortContext,
    ) => void,
  ): AbortablePromise<U> {
    return new AbortablePromise(executor, this.#state.sharedController)
  }

  /*
   * `reason: any` here and in `catch` is copied from lib.es5's `Promise`, not
   * a shortcut. These are function-typed parameters, so `strictFunctionTypes`
   * checks them contravariantly: with `unknown` the compiler would reject the
   * ordinary `.catch((e: Error) => ...)` that the base `Promise` accepts, and
   * the override would no longer be a compatible subtype.
   */
  then<TResult1 = T, TResult2 = never>(
    onFulfilled?: ((value: T) => PromiseLike<TResult1> | TResult1) | null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onRejected?: ((reason: any) => PromiseLike<TResult2> | TResult2) | null,
  ): AbortablePromise<TResult1 | TResult2> {
    // .then supports subclassing, so super.then returns an AbortablePromise.
    // See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/then
    const next = super.then(onFulfilled, onRejected) as AbortablePromise<
      TResult1 | TResult2
    >
    // Upstream link. A plain callback rather than a listener on next's signal,
    // so that chaining never forces an AbortController into existence.
    next.#state.link(() => this.abort())
    return next
  }

  catch<TResult = never>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onrejected?: ((reason: any) => PromiseLike<TResult> | TResult) | null,
  ): AbortablePromise<T | TResult> {
    return super.catch(onrejected) as AbortablePromise<T | TResult>
  }

  finally(onfinally?: (() => void) | null): AbortablePromise<T> {
    return super.finally(onfinally) as AbortablePromise<T>
  }
}
