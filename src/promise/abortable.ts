import { AbortError } from "../util/abort";

/**
 * An AbortablePromise is a Promise that can be aborted at any point prior to resolving.
 * The promise can be aborted by calling its abort() method.
 * If aborted before resolving, the AbortablePromise will reject with an AbortError.
 * If the AbortablePromise has already been fulfilled or rejected, calling abort() has
 * no effect. Calling abort() multiple times also has no further effect.
 *
 * The executor function can react to the abort event through the AbortSignal it
 * receives as an extra argument.
 */
export class AbortablePromise<T> extends Promise<T> {
  static readonly AbortError = new AbortError("AbortablePromise aborted");

  /**
   * Wraps a regular Promise to make it abortable.
   * Note that the wrapped Promise will not react to being aborted unless it's already
   * an AbortablePromise. Otherwise, aborting will only cause the new AbortablePromise
   * to reject with an AbortError after the wrapped Promise has resolved.
   * @param source
   */
  static of<T>(source: T | Promise<T>): AbortablePromise<T> {
    if (source instanceof AbortablePromise) {
      return source;
    }

    if (source instanceof Promise) {
      return new AbortablePromise<T>((resolve, reject) => {
        source.then(resolve).catch(reject);
      });
    }

    return new AbortablePromise<T>((resolve, reject) => {
      Promise.resolve(source).then(resolve).catch(reject);
    });
  }

  static reject<T = never>(reason?: any): AbortablePromise<T> {
    return AbortablePromise.of(Promise.reject(reason));
  }

  static resolve<T>(value?: T | PromiseLike<T>): AbortablePromise<T | undefined> {
    return AbortablePromise.of(Promise.resolve(value));
  }

  static abort<T = never>(): AbortablePromise<T> {
    const controller = new AbortController();
    controller.abort();
    return new AbortablePromise<T>((resolve, reject) => {
      reject(AbortablePromise.AbortError);
    }, controller);
  }

  private readonly controller: AbortController;

  /**
   * Creates a new AbortablePromise.
   * The AbortablePromise behaves exactly as a regular Promise, except that if its
   * abort() method is called before it has resolved, it will be rejected with
   * AbortablePromise.AbortError.
   *
   * @param executor An executor callback, just like the one passed to a regular Promise.
   * The executor has access to the AbortSignal that controls the AbortablePromise's abort behavior.
   * @param {AbortController} [controller] If given, the AbortablePromise will use this AbortController
   * to control its abortable behavior instead of creating one itself.
   * Beware that calling abort() on the resulting AbortablePromise will also abort the passed Controller.
   */
  constructor(
    executor: (
      resolve: (value: T | PromiseLike<T>) => void,
      reject: (reason?: any) => void,
      signal: AbortSignal
    ) => void,
    controller: AbortController = new AbortController()
  ) {
    const signal = controller.signal;

    super((resolve, reject) => {
      signal.addEventListener("abort", () => reject(AbortablePromise.AbortError));
      if (signal.aborted) {
        reject(AbortablePromise.AbortError);
      } else {
        executor(resolve, reject, signal);
      }
    });

    this.controller = controller;

    return this;
  }

  abort() {
    this.controller.abort();
  }

  abortOn(signal: AbortSignal): AbortablePromise<T> {
    if (signal.aborted) {
      this.abort();
    } else {
      signal.addEventListener("abort", () => this.abort());
    }
    return this;
  }

  /**
   * Creates a new AbortablePromise as a peer of the current one.
   * The new AbortablePromise shares its peer's AbortController,
   * so aborting one will also abort the other.
   * @param executor
   */
  peer<U>(
    executor: (
      resolve: (value: U | PromiseLike<U>) => void,
      reject: (reason?: any) => void,
      signal: AbortSignal
    ) => void
  ): AbortablePromise<U> {
    return new AbortablePromise(executor, this.controller);
  }

  then<TResult1 = T, TResult2 = never>(
    onFulfilled?: ((value: T) => PromiseLike<TResult1> | TResult1) | undefined | null,
    onRejected?: ((reason: any) => PromiseLike<TResult2> | TResult2) | undefined | null
  ): AbortablePromise<TResult1 | TResult2> {
    // .then supports subclassing, so super.then returns an AbortablePromise
    // See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/then
    const next = super.then(onFulfilled, onRejected) as AbortablePromise<TResult1 | TResult2>;
    this.abortOn(next.controller.signal);
    return next;
  }

  catch<TResult = never>(
    onrejected?: ((reason: any) => PromiseLike<TResult> | TResult) | undefined | null
  ): AbortablePromise<T | TResult> {
    return super.catch(onrejected) as AbortablePromise<T | TResult>;
  }

  finally(onfinally?: (() => void) | undefined | null): AbortablePromise<T> {
    return super.finally(onfinally) as AbortablePromise<T>;
  }
}
