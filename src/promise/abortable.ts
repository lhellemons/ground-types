import { AbortError } from '../abort/index.js'
import { hasPrototype } from '../internal/is-error.js'

/* `Promise`, `Promise.prototype`, `Promise.prototype.then` and `Reflect.apply`,
   captured when the module loads. */
const NativePromise = Promise
const promisePrototype = Promise.prototype
// eslint-disable-next-line @typescript-eslint/unbound-method -- only applied
const promiseThen = Promise.prototype.then
const apply = Reflect.apply
const cycleMessage = 'Chaining cycle detected for promise #<AbortablePromise>'

/* Whether `value` is a native Promise or a subclass instance: `instanceof
   Promise`, but by `isPrototypeOf`, so `Promise[Symbol.hasInstance]` is not
   consulted. False for a value whose prototype chain cannot be walked. */
function isPromise(value: unknown): value is Promise<unknown> {
  try {
    return hasPrototype(promisePrototype, value)
  } catch {
    return false
  }
}

/* Calls `onFulfilled` or `onRejected` when `value` settles, which is `value`
   followed as a native resolve function follows it. `then` is the function
   read from `value`. `Promise.prototype.then` is called on `value` at once,
   and what the call throws is thrown. Any other `then` is called from a job of
   a native promise that is resolved with it, so its callbacks run once at most,
   a thenable it resolves with is followed in turn, and what the call throws
   rejects that promise. A callback that `then` calls with `isOwner`'s value
   rejects instead, as a native resolve function does for its own promise. */
function follow(
  value: unknown,
  then: (onFulfilled: unknown, onRejected: unknown) => unknown,
  onFulfilled: (settledValue: never) => void,
  onRejected: (reason: unknown) => void,
  isOwner: (settledValue: unknown) => boolean,
): void {
  if (then === promiseThen) {
    apply(then, value, [onFulfilled, onRejected])
    return
  }
  const following = new NativePromise<unknown>((resolve) => {
    resolve({
      then: (
        resolveFollowing: (settledValue: unknown) => void,
        rejectFollowing: (reason: unknown) => void,
      ) =>
        apply(then, value, [
          (settledValue: unknown) => {
            if (isOwner(settledValue)) {
              rejectFollowing(new TypeError(cycleMessage))
            } else {
              resolveFollowing(settledValue)
            }
          },
          rejectFollowing,
        ]),
    })
  })
  apply(promiseThen, following, [onFulfilled, onRejected])
}

/* Calls `action` on every item, also after one throws, and throws the first
   error once every item has been visited. */
function runAll<T>(items: readonly T[], action: (item: T) => void): void {
  let failed = false
  let firstError: unknown
  for (const item of items) {
    try {
      action(item)
    } catch (error) {
      if (!failed) {
        failed = true
        firstError = error
      }
    }
  }
  if (failed) {
    throw firstError
  }
}

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
    // A settled promise never fires its links.
    if (!this.#settled) {
      this.#linked.push(onAbort)
    }
  }

  abort(): void {
    if (this.#aborted || this.#settled) {
      return
    }
    this.#aborted = true
    this.#settled = true

    // Fire the platform signal before rejecting, so an executor watching it
    // can release resources before the rejection propagates. Re-entry through
    // watchController is harmless: #aborted is already set. A controller whose
    // signal has aborted is not asked again. One whose `abort()` throws does
    // not stop the rejection, the links or the release; its error is thrown
    // after the last link, ahead of theirs.
    let failed = false
    let firstError: unknown
    try {
      if (this.#controller && !this.#controller.signal.aborted) {
        this.#controller.abort()
      }
    } catch (error) {
      failed = true
      firstError = error
    }
    this.#rejectSelf?.(new AbortError('AbortablePromise aborted'))

    // Every link fires, whether or not an earlier one throws; the first error
    // is thrown once they have. The signals are released either way.
    const linked = this.#linked.splice(0)
    try {
      runAll(linked, (onAbort) => {
        onAbort()
      })
    } catch (error) {
      if (!failed) {
        failed = true
        firstError = error
      }
    }
    // Last, so that a signal firing into this call has already been handled
    // by the listener that is about to be removed.
    this.#release()
    if (failed) {
      throw firstError
    }
  }
}

/**
 * The `then` of `value` when `value` is a thenable — something a promise
 * resolves *to* rather than settles *with*, by the test the promise resolution
 * procedure makes — and `undefined` otherwise. `then` is read once, as the
 * procedure reads it, and that read can throw.
 */
function thenOf(
  value: unknown,
): ((onFulfilled: unknown, onRejected: unknown) => unknown) | undefined {
  if (
    value === null ||
    (typeof value !== 'object' && typeof value !== 'function')
  ) {
    return undefined
  }
  const then = (value as { then?: unknown }).then
  return typeof then === 'function'
    ? (then as (onFulfilled: unknown, onRejected: unknown) => unknown)
    : undefined
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
   * unless it is already an AbortablePromise, which `of` returns as it is
   * (a Proxy over one is not: it is wrapped like any other value). Otherwise
   * aborting only rejects the wrapper; the underlying work runs to completion,
   * unobserved.
   */
  static of<T>(source: T | Promise<T>): AbortablePromise<T> {
    if (AbortablePromise.#isAbortablePromise(source)) {
      return source as AbortablePromise<T>
    }

    if (isPromise(source)) {
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
   * Whether `value` carries the private field that only this class's
   * constructor sets and has `AbortablePromise.prototype` on its prototype
   * chain. False for a Proxy over an AbortablePromise, whatever its traps, and
   * for a value whose chain cannot be walked.
   */
  static #isAbortablePromise(
    value: unknown,
  ): value is AbortablePromise<unknown> {
    if (typeof value !== 'object' || value === null || !(#state in value)) {
      return false
    }
    try {
      return hasPrototype(AbortablePromise.prototype, value)
    } catch {
      return false
    }
  }

  /**
   * Makes the promise `combine` returns for the items of `values`, and links
   * its abort to the members: aborting it calls `abort()` on each member that
   * is an AbortablePromise (`#isAbortablePromise`) whose `then`, read when the
   * combinator takes the member, is a function, and that is still an
   * AbortablePromise when it is aborted. `abort()` is called on every such
   * member even when one throws; the first error is thrown after the last. A
   * member that settles first aborts no other (see
   * docs/adr/0002-abort-propagation.md).
   *
   * `values` is iterated lazily, as the native combinators iterate it, so
   * what it throws rejects the promise, a member taken before the throw is
   * subscribed to, and the iterator is closed when the combinator stops early.
   * A member that is an AbortablePromise is handed to the combinator as a
   * thenable that calls the `then` that was read, and a subclass's `resolve`
   * receives that thenable; one whose `then` getter throws is handed over as a
   * thenable whose `then` throws that error; one whose `then` is not a
   * function is handed over as it is, read again by the combinator, and not
   * aborted.
   */
  static #fanIn(
    values: Iterable<unknown>,
    combine: (members: Iterable<unknown>) => Promise<unknown>,
  ): AbortablePromise<unknown> {
    const adopted: AbortablePromise<unknown>[] = []
    const members = function* (): Generator<unknown> {
      for (const item of values) {
        if (!AbortablePromise.#isAbortablePromise(item)) {
          yield item
          continue
        }
        let then: ReturnType<typeof thenOf>
        try {
          then = thenOf(item)
        } catch (error) {
          // What the combinator would have met: a thenable whose `then` throws.
          yield {
            get then(): never {
              throw error
            },
          }
          continue
        }
        if (then === undefined) {
          yield item
          continue
        }
        adopted.push(item)
        yield {
          then: (onFulfilled: unknown, onRejected: unknown) =>
            apply(then, item, [onFulfilled, onRejected]),
        }
      }
    }

    const combined = combine(members()) as AbortablePromise<unknown>
    const combinedState = combined.#state
    try {
      combinedState.link(() => {
        runAll(adopted, (member) => {
          if (AbortablePromise.#isAbortablePromise(member)) {
            member.abort()
          }
        })
      })
    } catch {
      // The combined promise was aborted while `values` was iterated, so the
      // link fired at once and a member's `abort()` threw. It is aborted
      // already, and has no caller to throw to.
    }
    return combined
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
    return AbortablePromise.#fanIn(values, (members) => super.all(members))
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
    return AbortablePromise.#fanIn(values, (members) =>
      super.allSettled(members),
    )
  }

  static race<T extends readonly unknown[] | []>(
    values: T,
  ): AbortablePromise<Awaited<T[number]>>
  static race<T>(
    values: Iterable<T | PromiseLike<T>>,
  ): AbortablePromise<Awaited<T>>
  static race(values: Iterable<unknown>): AbortablePromise<unknown> {
    return AbortablePromise.#fanIn(values, (members) => super.race(members))
  }

  static any<T extends readonly unknown[] | []>(
    values: T,
  ): AbortablePromise<Awaited<T[number]>>
  static any<T>(
    values: Iterable<T | PromiseLike<T>>,
  ): AbortablePromise<Awaited<T>>
  static any(values: Iterable<unknown>): AbortablePromise<unknown> {
    return AbortablePromise.#fanIn(values, (members) => super.any(members))
  }

  readonly #state: AbortState

  /**
   * Creates a new AbortablePromise, which behaves exactly as a regular Promise
   * except that calling {@link AbortablePromise.abort} before it settles
   * rejects it with an {@link AbortError}.
   *
   * @param executor An executor callback as a regular Promise takes, with an
   * {@link AbortContext} passed as a third argument. Only the first call to
   * its `resolve` or `reject` has an effect, as for a regular Promise's:
   * a thenable passed to a later `resolve` is not followed, and an executor
   * that throws rejects the promise unless `resolve` or `reject` was called
   * already. Resolving with the promise itself rejects it with a `TypeError`,
   * as does a thenable it was resolved with that fulfils with the promise.
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
    // The promise itself, once `super()` has returned, for the check a native
    // resolve function makes that it is not resolved with its own promise.
    const owner = Object.create(null) as { promise?: object }
    const isOwner = (value: unknown): boolean =>
      owner.promise !== undefined && value === owner.promise

    super((resolve, reject) => {
      state.captureReject(reject)

      if (state.startedAborted) {
        state.abort()
        return
      }
      state.watchController()

      // Native resolve and reject functions share one flag: every call after
      // the first is ignored, also while a thenable passed to the first is
      // being followed. Whether the promise has settled is another matter, and
      // is what `abort` goes by.
      let alreadyResolved = false

      const resolveWith = (value: T | PromiseLike<T>): void => {
        if (alreadyResolved) {
          return
        }
        alreadyResolved = true

        // A promise resolved with itself rejects, as a native one does.
        if (isOwner(value)) {
          if (state.claimSettlement()) {
            reject(new TypeError(cycleMessage))
          }
          return
        }

        // Reading `then` can throw (a revoked Proxy, a throwing getter). As
        // with a native Promise's resolve function, that rejects the promise
        // rather than throwing to whoever called `resolve`, which would
        // otherwise leave it pending when called after the executor returned.
        let then: ReturnType<typeof thenOf>
        try {
          then = thenOf(value)
        } catch (error) {
          if (state.claimSettlement()) {
            reject(error)
          }
          return
        }

        if (then === undefined) {
          if (state.claimSettlement()) {
            resolve(value)
          }
          return
        }

        // Resolving with a thenable is not settling: the outcome has been
        // handed to that thenable, which may not settle for a long time or
        // at all. Claiming settlement here would make `abort()` a silent
        // no-op for the delegating shape this class exists for —
        // `new AbortablePromise((resolve) => resolve(fetchThing()))`. Adopt
        // it instead, and claim only when it really settles.
        const adopted = value as PromiseLike<T>
        try {
          follow(
            adopted,
            then,
            (settledValue: T) => {
              if (state.claimSettlement()) {
                resolve(settledValue)
              }
            },
            (reason: unknown) => {
              if (state.claimSettlement()) {
                reject(reason)
              }
            },
            isOwner,
          )

          // Delegation is upstream, so abort travels it like any other
          // upstream link: the delegate is where the work actually is, and
          // rejecting only the outer promise would leave it running. The
          // adoption has been started before the link is registered: a
          // delegate whose `then` is `Promise.prototype.then` already has its
          // handlers, and any other has a job queued that calls its `then`,
          // which runs before a rejection is reported as unhandled, also for
          // a link that fires at once because `resolve` came after the abort.
          if (AbortablePromise.#isAbortablePromise(adopted)) {
            state.link(() => {
              if (AbortablePromise.#isAbortablePromise(adopted)) {
                adopted.abort()
              }
            })
          }
        } catch (error) {
          // As a native resolve function rejects when following the thenable
          // throws (its `then` throws). Once the promise is settled, so also
          // when a late link throws, the error is dropped.
          if (state.claimSettlement()) {
            reject(error)
          }
        }
      }

      const rejectWith = (reason?: unknown): void => {
        if (alreadyResolved) {
          return
        }
        alreadyResolved = true
        if (state.claimSettlement()) {
          reject(reason)
        }
      }

      // An executor that throws rejects through the same function it was given,
      // so a throw after `resolve(thenable)` is ignored as a native one is.
      try {
        executor(resolveWith, rejectWith, state)
      } catch (error) {
        rejectWith(error)
      }
    })

    owner.promise = this
    this.#state = state
  }

  /**
   * Aborts this promise, rejecting it with an {@link AbortError} if it has not
   * already settled. Recognise the rejection with `abort/isAbortError` rather
   * than by identity — every abort constructs its own Error.
   *
   * Throws only when the abort reaches a promise whose own `abort()` throws or
   * is missing — a subclass's override, say, on the promise this one was
   * derived from, a delegate or a fan-in member — or when the controller passed
   * to the constructor throws from its `abort()`. In each case this promise is
   * rejected and its signals are released, and `abort()` is called on every
   * promise the abort reaches; the first error is thrown after the last, the
   * controller's before the others. A controller whose signal has aborted
   * already is not asked to abort again.
   *
   * Called through a signal that aborts later ({@link AbortablePromise.abortOn},
   * a controller passed to the constructor, {@link AbortablePromise.peer}), the
   * error is thrown inside the signal's event listener, where the platform
   * reports it as an uncaught exception, and nothing returns it to a caller.
   * `abortOn` with a signal that has already aborted aborts at once and throws
   * to its caller.
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
   *
   * An `abort()` that throws, reached through the signal when it aborts later,
   * is reported as an uncaught exception; for a signal that has already
   * aborted it is thrown to the caller of `abortOn`: see
   * {@link AbortablePromise.abort}.
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
   *
   * An `abort()` that throws, reached through the shared controller, is
   * reported as an uncaught exception: see {@link AbortablePromise.abort}.
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
