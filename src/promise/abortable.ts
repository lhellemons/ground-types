import { AbortError } from '../abort/index.js'

/**
 * What an {@link AbortablePromise}'s executor receives as its third argument,
 * so it can react to the promise being aborted.
 *
 * `signal` is a property rather than an argument because it is realised
 * lazily: the underlying `AbortController` — and the `EventTarget` inside it —
 * is allocated the first time something reads this, and never for a promise
 * whose executor does not care. Reading it always yields the same real
 * `AbortSignal`, so `instanceof` and every platform API that takes one still
 * work.
 */
export interface AbortContext {
  readonly signal: AbortSignal
}

/**
 * The abort machinery for one {@link AbortablePromise}, kept in its own object
 * so that it exists before `super()` is called and can therefore be reached
 * from inside the Promise executor.
 *
 * This object is handed to the executor as its {@link AbortContext}, which is
 * why it allocates nothing extra. The context type exposes only `signal`, so
 * the rest of this surface is not reachable through it in TypeScript.
 */
class AbortState {
  #controller?: AbortController
  #rejectSelf?: (reason?: unknown) => void
  #settled = false
  #aborted = false
  #linked: Array<() => void> = []

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
    this.#controller?.signal.addEventListener('abort', () => this.abort(), {
      once: true,
    })
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
    return true
  }

  /**
   * Registers a callback for when this promise is aborted. Used for the
   * upstream link from a derived promise to its source, in place of a listener
   * on a signal — which would force a controller into existence for every link
   * of every chain.
   */
  link(onAbort: () => void): void {
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
  }
}

/**
 * An AbortablePromise is a Promise that can be aborted at any point prior to
 * settling, by calling its {@link AbortablePromise.abort} method. An aborted
 * AbortablePromise rejects with an {@link AbortError}. Aborting one that has
 * already fulfilled or rejected has no effect, and neither does aborting the
 * same one more than once.
 *
 * The executor can react to the abort through the {@link AbortContext} it
 * receives as a third argument.
 *
 * Abort propagates *upstream*: aborting a promise returned by `then`, `catch`
 * or `finally` also aborts the promise it derived from, so a chain aborts as
 * one unit and cancelling the tail really does cancel the work at the head.
 * The consequence to know about is that two chains branched off one source
 * share that source, so aborting either branch aborts the other. Use
 * {@link AbortablePromise.detach} at the branch point when that is not what
 * you want. See docs/adr/0002-abort-propagation.md.
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
    return AbortablePromise.of(Promise.reject(reason))
  }

  static resolve(): AbortablePromise<void>
  static resolve<T>(value: T | PromiseLike<T>): AbortablePromise<Awaited<T>>
  static resolve<T>(
    value?: T | PromiseLike<T>,
  ): AbortablePromise<Awaited<T> | void> {
    return AbortablePromise.of(
      Promise.resolve(value),
    ) as AbortablePromise<Awaited<T> | void>
  }

  /** An AbortablePromise that has already been aborted. */
  static abort<T = never>(): AbortablePromise<T> {
    const aborted = new AbortablePromise<T>(() => {})
    aborted.abort()
    return aborted
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
   * the passed controller too, and so everything else it governs.
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
   * The listener is registered `{ once: true }`, so it is released as soon as
   * the signal aborts. It is deliberately *not* also released when this
   * promise settles: observing settlement means attaching a rejection handler,
   * which would mark this promise as handled and either suppress a genuine
   * unhandled-rejection warning or manufacture a spurious one. Binding many
   * short-lived promises to one long-lived signal therefore accumulates
   * listeners on that signal until it aborts.
   */
  abortOn(signal: AbortSignal): AbortablePromise<T> {
    if (signal.aborted) {
      this.abort()
    } else {
      signal.addEventListener('abort', () => this.abort(), { once: true })
    }
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
   *
   * Implemented via `super.then`, which bypasses this class's `then` override
   * and so constructs the derived promise through the species constructor
   * without the upstream link that override adds.
   */
  detach(): AbortablePromise<T> {
    return super.then() as AbortablePromise<T>
  }

  /**
   * Creates a new AbortablePromise as a peer of this one. The peer shares this
   * promise's AbortController, so aborting either aborts both.
   *
   * Unlike `then`, this forces a controller into existence, since sharing one
   * is the whole point.
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

  then<TResult1 = T, TResult2 = never>(
    onFulfilled?:
      ((value: T) => PromiseLike<TResult1> | TResult1) | undefined | null,
    onRejected?:
      ((reason: any) => PromiseLike<TResult2> | TResult2) | undefined | null,
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
    onrejected?:
      ((reason: any) => PromiseLike<TResult> | TResult) | undefined | null,
  ): AbortablePromise<T | TResult> {
    return super.catch(onrejected) as AbortablePromise<T | TResult>
  }

  finally(onfinally?: (() => void) | undefined | null): AbortablePromise<T> {
    return super.finally(onfinally) as AbortablePromise<T>
  }
}
