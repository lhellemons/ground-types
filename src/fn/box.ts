/* The class is declared privately and exported as a value binding only, so
   the instance type has no spellable name: `Fn` in type position resolves
   to the unboxed alias below. Only `export const` plus a locally declared
   type alias produces that split — the tidier-looking matched export
   clauses fail, and fail in the direction that hands the *class* the type
   meaning. See docs/adr/0005-box-classes.md. */

import type { Mapper } from './index.js'
import type { NotAPromise, Result } from '../result/index.js'

/**
 * The unboxed type, under the capitalised name: `Fn` written in type
 * position is `./index.js`'s `Fn`, never the Box. One name, both
 * meanings — the class below in value position, this alias in type
 * position.
 */
export type Fn<
  Return = unknown,
  Args extends unknown[] = unknown[],
> = import('./index.js').Fn<Return, Args>

/** Any function at all — the constraint a boxed subject must satisfy. */
type AnyFn = (...args: never[]) => unknown

/**
 * Gates {@link Mapper}-building composition to a unary subject, surfacing
 * the diagnostic as a readable string: `compose` prepends a step, which
 * replaces the whole parameter list, so an n-ary subject has no single
 * input for the prepended step to produce. Resolves to the subject's input
 * type when it is unary. Exported so its exact wording can be pinned by
 * type-level tests, like `NotAResult`/`NotAPromise`.
 */
export type UnaryInput<R extends AnyFn> =
  Parameters<R> extends [infer A]
    ? A
    : 'compose prepends a step, replacing the whole parameter list — this function takes more than one argument; use .pipe to transform its return instead'

/**
 * Rejects a `tryCatch` subject that can return a thenable, surfacing the
 * diagnostic as a readable string: `tryCatch` is the synchronous lift, and
 * its asynchronous twin is `Call`'s `resultify`. Exported so its exact
 * wording can be pinned by type-level tests, like
 * `NotAResult`/`NotAPromise`.
 */
export type NotAsync<R extends AnyFn> =
  NotAPromise<ReturnType<R>> extends string
    ? 'This function returns a Promise (or thenable) — tryCatch is the synchronous lift; use call/resultify or promise/resultify instead'
    : unknown

/** Every member throws: the surface is pinned ahead of its implementation. */
function notImplemented(..._args: unknown[]): never {
  throw new Error(
    'Not implemented — the Box surface is pinned, not built; see docs/adr/0005-box-classes.md',
  )
}

/**
 * The Fn Box: a transient chain builder over a function of any arity (see
 * CONTEXT.md's Box entry). Enter through a static factory, chain, and
 * leave through a terminal — `unbox()`, `.fn`, or `apply(...)`, which
 * terminates by running the held function. {@link pipe} transforms the
 * return and keeps the parameter list; {@link compose} prepends in its own
 * right-to-left direction, unary subjects only — a chain may mix
 * directions (docs/adr/0005-box-classes.md).
 */
class FnBox<R extends AnyFn> {
  private constructor() {
    /* Instances come only from the static factory. */
  }

  /** Boxes a function of any arity. */
  static from<F extends AnyFn>(fn: F): FnBox<F> {
    return notImplemented(fn)
  }

  /**
   * Boxes the identity {@link Mapper} for a `T` — the counterpart of
   * `fn/identity`, as a way in: the free function takes the value, this
   * static takes none and hands back the Box of the Mapper.
   */
  static identity<T>(): FnBox<Mapper<T, T>> {
    return notImplemented()
  }

  /**
   * Boxes a function that ignores its arguments and always returns `t` —
   * the counterpart of `fn/constant`.
   */
  static constant<T>(t: T): FnBox<(..._: unknown[]) => T> {
    return notImplemented(t)
  }

  /**
   * Appends steps left to right — the counterpart of `fn/pipe`, with the
   * subject's eventual arguments in place of `pipe`'s value: transforms
   * the held function's return type and leaves its parameter list alone,
   * so an n-ary subject chains too. Typed up to ten steps, like `pipe`.
   */
  pipe<U>(f1: Mapper<ReturnType<R>, U>): FnBox<(...args: Parameters<R>) => U>
  pipe<B, U>(
    f1: Mapper<ReturnType<R>, B>,
    f2: Mapper<B, U>,
  ): FnBox<(...args: Parameters<R>) => U>
  pipe<B, C, U>(
    f1: Mapper<ReturnType<R>, B>,
    f2: Mapper<B, C>,
    f3: Mapper<C, U>,
  ): FnBox<(...args: Parameters<R>) => U>
  pipe<B, C, D, U>(
    f1: Mapper<ReturnType<R>, B>,
    f2: Mapper<B, C>,
    f3: Mapper<C, D>,
    f4: Mapper<D, U>,
  ): FnBox<(...args: Parameters<R>) => U>
  pipe<B, C, D, E, U>(
    f1: Mapper<ReturnType<R>, B>,
    f2: Mapper<B, C>,
    f3: Mapper<C, D>,
    f4: Mapper<D, E>,
    f5: Mapper<E, U>,
  ): FnBox<(...args: Parameters<R>) => U>
  pipe<B, C, D, E, F, U>(
    f1: Mapper<ReturnType<R>, B>,
    f2: Mapper<B, C>,
    f3: Mapper<C, D>,
    f4: Mapper<D, E>,
    f5: Mapper<E, F>,
    f6: Mapper<F, U>,
  ): FnBox<(...args: Parameters<R>) => U>
  pipe<B, C, D, E, F, G, U>(
    f1: Mapper<ReturnType<R>, B>,
    f2: Mapper<B, C>,
    f3: Mapper<C, D>,
    f4: Mapper<D, E>,
    f5: Mapper<E, F>,
    f6: Mapper<F, G>,
    f7: Mapper<G, U>,
  ): FnBox<(...args: Parameters<R>) => U>
  pipe<B, C, D, E, F, G, H, U>(
    f1: Mapper<ReturnType<R>, B>,
    f2: Mapper<B, C>,
    f3: Mapper<C, D>,
    f4: Mapper<D, E>,
    f5: Mapper<E, F>,
    f6: Mapper<F, G>,
    f7: Mapper<G, H>,
    f8: Mapper<H, U>,
  ): FnBox<(...args: Parameters<R>) => U>
  pipe<B, C, D, E, F, G, H, I, U>(
    f1: Mapper<ReturnType<R>, B>,
    f2: Mapper<B, C>,
    f3: Mapper<C, D>,
    f4: Mapper<D, E>,
    f5: Mapper<E, F>,
    f6: Mapper<F, G>,
    f7: Mapper<G, H>,
    f8: Mapper<H, I>,
    f9: Mapper<I, U>,
  ): FnBox<(...args: Parameters<R>) => U>
  pipe<B, C, D, E, F, G, H, I, J, U>(
    f1: Mapper<ReturnType<R>, B>,
    f2: Mapper<B, C>,
    f3: Mapper<C, D>,
    f4: Mapper<D, E>,
    f5: Mapper<E, F>,
    f6: Mapper<F, G>,
    f7: Mapper<G, H>,
    f8: Mapper<H, I>,
    f9: Mapper<I, J>,
    f10: Mapper<J, U>,
  ): FnBox<(...args: Parameters<R>) => U>
  pipe(...fns: AnyFn[]): never {
    return notImplemented(...fns)
  }

  /**
   * Prepends steps right to left — the counterpart of `fn/compose`, with
   * the held function as the last step: `box.compose(g).apply(x)` runs `g`
   * first. Unary subjects only (see {@link UnaryInput}) — prepending
   * replaces the whole parameter list. Typed up to ten steps, like
   * `compose`.
   */
  compose<X, A extends UnaryInput<R>>(
    g1: Mapper<X, A>,
  ): FnBox<Mapper<X, ReturnType<R>>>
  compose<X, B, A extends UnaryInput<R>>(
    g1: Mapper<B, A>,
    g2: Mapper<X, B>,
  ): FnBox<Mapper<X, ReturnType<R>>>
  compose<X, B, C, A extends UnaryInput<R>>(
    g1: Mapper<C, A>,
    g2: Mapper<B, C>,
    g3: Mapper<X, B>,
  ): FnBox<Mapper<X, ReturnType<R>>>
  compose<X, B, C, D, A extends UnaryInput<R>>(
    g1: Mapper<D, A>,
    g2: Mapper<C, D>,
    g3: Mapper<B, C>,
    g4: Mapper<X, B>,
  ): FnBox<Mapper<X, ReturnType<R>>>
  compose<X, B, C, D, E, A extends UnaryInput<R>>(
    g1: Mapper<E, A>,
    g2: Mapper<D, E>,
    g3: Mapper<C, D>,
    g4: Mapper<B, C>,
    g5: Mapper<X, B>,
  ): FnBox<Mapper<X, ReturnType<R>>>
  compose<X, B, C, D, E, F, A extends UnaryInput<R>>(
    g1: Mapper<F, A>,
    g2: Mapper<E, F>,
    g3: Mapper<D, E>,
    g4: Mapper<C, D>,
    g5: Mapper<B, C>,
    g6: Mapper<X, B>,
  ): FnBox<Mapper<X, ReturnType<R>>>
  compose<X, B, C, D, E, F, G, A extends UnaryInput<R>>(
    g1: Mapper<G, A>,
    g2: Mapper<F, G>,
    g3: Mapper<E, F>,
    g4: Mapper<D, E>,
    g5: Mapper<C, D>,
    g6: Mapper<B, C>,
    g7: Mapper<X, B>,
  ): FnBox<Mapper<X, ReturnType<R>>>
  compose<X, B, C, D, E, F, G, H, A extends UnaryInput<R>>(
    g1: Mapper<H, A>,
    g2: Mapper<G, H>,
    g3: Mapper<F, G>,
    g4: Mapper<E, F>,
    g5: Mapper<D, E>,
    g6: Mapper<C, D>,
    g7: Mapper<B, C>,
    g8: Mapper<X, B>,
  ): FnBox<Mapper<X, ReturnType<R>>>
  compose<X, B, C, D, E, F, G, H, I, A extends UnaryInput<R>>(
    g1: Mapper<I, A>,
    g2: Mapper<H, I>,
    g3: Mapper<G, H>,
    g4: Mapper<F, G>,
    g5: Mapper<E, F>,
    g6: Mapper<D, E>,
    g7: Mapper<C, D>,
    g8: Mapper<B, C>,
    g9: Mapper<X, B>,
  ): FnBox<Mapper<X, ReturnType<R>>>
  compose<X, B, C, D, E, F, G, H, I, J, A extends UnaryInput<R>>(
    g1: Mapper<J, A>,
    g2: Mapper<I, J>,
    g3: Mapper<H, I>,
    g4: Mapper<G, H>,
    g5: Mapper<F, G>,
    g6: Mapper<E, F>,
    g7: Mapper<D, E>,
    g8: Mapper<C, D>,
    g9: Mapper<B, C>,
    g10: Mapper<X, B>,
  ): FnBox<Mapper<X, ReturnType<R>>>
  compose(...gns: AnyFn[]): never {
    return notImplemented(...gns)
  }

  /**
   * Lifts the held throwing function into one returning a `Result` — the
   * counterpart of `result/tryCatch`, as a chaining member: `resultify`'s
   * synchronous twin. The default handler keeps a thrown `Error` as it
   * was, wrapping anything else in `ThrownError`; supply one to translate
   * or recover. Synchronous subjects only (see {@link NotAsync}).
   */
  tryCatch(
    this: NotAsync<R> extends string ? NotAsync<R> : FnBox<R>,
  ): FnBox<(...args: Parameters<R>) => Result<ReturnType<R>, Error>>
  tryCatch<E extends Error>(
    this: NotAsync<R> extends string ? NotAsync<R> : FnBox<R>,
    errorHandler: Mapper<unknown, Result<ReturnType<R>, E>>,
  ): FnBox<(...args: Parameters<R>) => Result<ReturnType<R>, E>>
  tryCatch<E extends Error>(
    this: NotAsync<R> extends string ? NotAsync<R> : FnBox<R>,
    errorHandler?: Mapper<unknown, Result<ReturnType<R>, E>>,
  ): FnBox<(...args: Parameters<R>) => Result<ReturnType<R>, E>> {
    return notImplemented(errorHandler)
  }

  /** Terminal: runs the held function with its own parameter list. */
  apply(...args: Parameters<R>): ReturnType<R> {
    return notImplemented(...args)
  }

  /** Terminal: hands back the held function. */
  unbox(): R
  /**
   * Terminal, folding: applies `fn` to the held function and hands back
   * its result. `unbox(undefined)` is an argument, not a zero-arg call
   * (docs/adr/0003-currying.md), and a compile error.
   */
  unbox<U>(fn: (fn: R) => U): U
  unbox<U>(fn?: (fn: R) => U): R | U {
    return notImplemented(fn)
  }

  /** Terminal: the held function, as a property read. */
  get fn(): R {
    return notImplemented()
  }
}

export const Fn = FnBox
