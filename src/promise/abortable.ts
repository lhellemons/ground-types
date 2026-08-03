import { AbortError } from '../abort/index.js'

/**
 * An AbortablePromise is a Promise that can be aborted at any point prior to
 * settling, by calling its {@link AbortablePromise.abort} method. An aborted
 * AbortablePromise rejects with an {@link AbortError}. Aborting one that has
 * already fulfilled or rejected has no effect, and neither does aborting the
 * same one more than once.
 *
 * The executor can react to the abort through the `AbortSignal` it receives
 * as a third argument.
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
    const controller = new AbortController()
    controller.abort()
    // The executor never runs: the constructor sees an already-aborted signal
    // and rejects before reaching it.
    return new AbortablePromise<T>(() => {}, controller)
  }

  private readonly controller: AbortController

  /**
   * Creates a new AbortablePromise, which behaves exactly as a regular Promise
   * except that calling {@link AbortablePromise.abort} before it settles
   * rejects it with an {@link AbortError}.
   *
   * @param executor An executor callback as a regular Promise takes, with the
   * `AbortSignal` governing this promise passed as a third argument.
   * @param controller If given, this AbortablePromise is governed by that
   * controller rather than one of its own. Aborting the promise then aborts
   * the passed controller too, and so everything else it governs.
   */
  constructor(
    executor: (
      resolve: (value: T | PromiseLike<T>) => void,
      reject: (reason?: unknown) => void,
      signal: AbortSignal,
    ) => void,
    controller: AbortController = new AbortController(),
  ) {
    const signal = controller.signal

    super((resolve, reject) => {
      // A fresh Error per abort, so each carries the stack of the abort that
      // actually happened. A single shared instance would report one stack,
      // captured once at module load, for every abort in the process.
      const rejectAsAborted = () =>
        reject(new AbortError('AbortablePromise aborted'))

      if (signal.aborted) {
        rejectAsAborted()
      } else {
        signal.addEventListener('abort', rejectAsAborted, { once: true })
        executor(resolve, reject, signal)
      }
    })

    this.controller = controller
  }

  /**
   * Aborts this promise, rejecting it with an {@link AbortError} if it has not
   * already settled. Recognise the rejection with `abort/isAbortError` rather
   * than by identity — every abort constructs its own Error.
   */
  abort(): void {
    this.controller.abort()
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
   * and so constructs the derived promise through the species constructor with
   * a controller of its own, unlinked from this one.
   */
  detach(): AbortablePromise<T> {
    return super.then() as AbortablePromise<T>
  }

  /**
   * Creates a new AbortablePromise as a peer of this one. The peer shares this
   * promise's AbortController, so aborting either aborts both.
   */
  peer<U>(
    executor: (
      resolve: (value: U | PromiseLike<U>) => void,
      reject: (reason?: unknown) => void,
      signal: AbortSignal,
    ) => void,
  ): AbortablePromise<U> {
    return new AbortablePromise(executor, this.controller)
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
    // Upstream link: aborting the derived promise aborts this one. Registered
    // directly rather than through abortOn because next's signal lives and
    // dies with next, so there is nothing to accumulate on.
    next.controller.signal.addEventListener('abort', () => this.abort(), {
      once: true,
    })
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
