/* The class is declared privately and exported as a value binding only, so
   the instance type has no spellable name: `Result` in type position
   resolves to the unboxed alias below. Only `export const` plus a locally
   declared type alias produces that split — the tidier-looking matched
   export clauses fail, and fail in the direction that hands the *class* the
   type meaning. See docs/adr/0005-box-classes.md. */

import type {
  Failure,
  NotAPromise,
  NotAResult,
  Result as ResultValue,
  Success,
} from './index.js'
/* Module-private inference machinery, shared with `./index.ts` through a
   module deliberately absent from the exports map — which is what lets this
   class restate member types without widening the public surface. */
import type { ErrorOf, ValueOf } from './internal.js'

/**
 * The unboxed type, under the capitalised name: `Result<T, E>` written in
 * type position is `./index.js`'s `Result<T, E>`, never the Box. One name,
 * both meanings — the class below in value position, this alias in type
 * position.
 */
export type Result<T, E extends Error = Error> = import('./index.js').Result<
  T,
  E
>

/** Every member throws: the surface is pinned ahead of its implementation. */
function notImplemented(..._args: unknown[]): never {
  throw new Error(
    'Not implemented — the Box surface is pinned, not built; see docs/adr/0005-box-classes.md',
  )
}

/**
 * The Result Box: a transient chain builder over an unboxed `Result` (see
 * CONTEXT.md's Box entry). Enter through a static factory, chain, and leave
 * through a terminal — `unbox()` or `.result`. A Box is parameterised by
 * the unboxed type it holds, so recovery tracking is free — after
 * `orElse`/`fallback` the Box holds a `Success` and the terminal says so —
 * and the error union accumulates exactly the arms the links contribute
 * (docs/adr/0005-box-classes.md).
 */
class ResultBox<R> {
  private constructor() {
    /* Instances come only from the static factories. */
  }

  /** Boxes a value-or-error: the counterpart of `result()`, both arms. */
  static from<T, E extends Error = Error>(
    value: T | E,
  ): ResultBox<ResultValue<T, E>> {
    return notImplemented(value)
  }

  /**
   * Boxes a known-good value as a `Success`. Seeds `E = never` — unlike
   * `result/success`, whose default is `Error` — so a chain's error union
   * holds exactly what its links contribute
   * (docs/adr/0005-box-classes.md).
   */
  static success<T, E extends Error = never>(
    value: T,
  ): ResultBox<Success<T, E>> {
    return notImplemented(value)
  }

  /**
   * Boxes a known error as a `Failure` — the counterpart of
   * `result/failure`, error-first, phantom `T` defaulted.
   */
  static failure<E extends Error, T = unknown>(
    error: E,
  ): ResultBox<Failure<T, E>> {
    return notImplemented(error)
  }

  /**
   * Boxes a `Maybe`, reporting absence as the supplied error — the
   * counterpart of `result/fromMaybe`. The runtime check is inlined,
   * keeping the Box modules free of a runtime maybe/result cycle
   * (docs/adr/0001-unboxed-maybe-and-result.md). The value is spelled
   * `T | undefined` so the compiler can infer `T` from it
   * (docs/adr/0003-currying.md).
   */
  static fromMaybe<T, E extends Error>(
    error: E,
    value: T | undefined,
  ): ResultBox<ResultValue<T, E>> {
    return notImplemented(error, value)
  }

  /** @deprecated `isSuccess` asks about a value, not a Box — use `box.isSuccess()`. */
  static isSuccess(value: ResultBox<unknown>): never
  /** Type guard over an unboxed value — the counterpart of `result/isSuccess`. */
  static isSuccess<T, E extends Error = Error>(
    value: ResultValue<T, E>,
  ): value is Success<T, E>
  static isSuccess<T, E extends Error = Error>(
    value: ResultBox<unknown> | ResultValue<T, E>,
  ): boolean {
    return notImplemented(value)
  }

  /** @deprecated `isFailure` asks about a value, not a Box — use `box.isFailure()`. */
  static isFailure(value: ResultBox<unknown>): never
  /** Type guard over an unboxed value — the counterpart of `result/isFailure`. */
  static isFailure<T, E extends Error = Error>(
    value: ResultValue<T, E>,
  ): value is Failure<T, E>
  static isFailure<T, E extends Error = Error>(
    value: ResultBox<unknown> | ResultValue<T, E>,
  ): boolean {
    return notImplemented(value)
  }

  /**
   * Asserts an unboxed value is a `Success`, returning it or throwing the
   * carried `Error` — the counterpart of `result/assertSuccess`.
   */
  static assertSuccess<T, E extends Error = Error>(
    value: T | E,
  ): Success<T, E> {
    return notImplemented(value)
  }

  /**
   * Instance predicate: narrows this Box to one holding a `Success`.
   * Applies in the guarded branch only — `else` does not narrow; use
   * {@link isFailure} there.
   */
  isSuccess(): this is ResultBox<Exclude<R, Error>> {
    return notImplemented()
  }

  /** Instance predicate: narrows this Box to one holding a `Failure`. */
  isFailure(): this is ResultBox<Extract<R, Error>> {
    return notImplemented()
  }

  /**
   * Asserts the held value is a `Success`, so the chain continues over
   * one — the counterpart of `result/assertSuccess`, as a chaining member
   * rather than a terminal.
   */
  assertSuccess(): ResultBox<Success<ValueOf<R>, ErrorOf<R>>> {
    return notImplemented()
  }

  /**
   * Applies `fn` in the success channel, passing a held `Failure`
   * through — the counterpart of `result/map`. `fn` must return a plain,
   * already-resolved value: not a `Result` (use {@link andThen}) and not a
   * `Promise` (see `NotAResult`).
   */
  map<U extends NotAResult<U>>(
    fn: (value: ValueOf<R>) => U,
  ): ResultBox<ResultValue<U, ErrorOf<R>>> {
    return notImplemented(fn)
  }

  /**
   * Chains a second fallible step: `fn` itself returns a `Result`, and its
   * failure arm joins the held error union — the counterpart of
   * `result/andThen`.
   */
  andThen<U extends NotAPromise<U>>(
    fn: (value: ValueOf<R>) => U,
  ): ResultBox<ResultValue<ValueOf<U>, ErrorOf<R> | ErrorOf<U>>> {
    return notImplemented(fn)
  }

  /**
   * Applies `fn` in the failure channel, passing a held `Success`
   * through — the counterpart of `result/mapError`. `fn` returns a whole
   * `Result`, so it may recover; the held type tracks the arms `fn`
   * actually has.
   */
  mapError<S extends NotAPromise<S>>(
    fn: (error: ErrorOf<R>) => S,
  ): ResultBox<ResultValue<ValueOf<R> | ValueOf<S>, ErrorOf<S>>> {
    return notImplemented(fn)
  }

  /**
   * Substitutes an eager default for a held `Failure`, so the Box holds a
   * `Success` and says so — the counterpart of `result/orElse`.
   */
  orElse(defaultValue: ValueOf<R>): ResultBox<Success<ValueOf<R>, ErrorOf<R>>> {
    return notImplemented(defaultValue)
  }

  /**
   * Lazy counterpart of {@link orElse}: `fn` receives the held `Failure`
   * and must produce a `Success` — the counterpart of `result/fallback`.
   */
  fallback(
    fn: (
      error: Failure<ValueOf<R>, ErrorOf<R>>,
    ) => Success<ValueOf<R>, ErrorOf<R>>,
  ): ResultBox<Success<ValueOf<R>, ErrorOf<R>>> {
    return notImplemented(fn)
  }

  /**
   * Acts on the whole held value — runs `fn` for its side effect and hands
   * this Box back unchanged, return value discarded (see CONTEXT.md's Act
   * entry). The counterpart of `result/act`. `fn` must resolve
   * synchronously; a thenable return is a compile error.
   */
  act<S extends NotAPromise<S>>(fn: (value: R) => S): this {
    return notImplemented(fn)
  }

  /** Acts only when the held value is a `Success`, receiving it. */
  ifSuccess<S extends NotAPromise<S>>(fn: (value: ValueOf<R>) => S): this {
    return notImplemented(fn)
  }

  /** Acts only when the held value is a `Failure`, receiving its error. */
  ifFailure<S extends NotAPromise<S>>(fn: (error: ErrorOf<R>) => S): this {
    return notImplemented(fn)
  }

  /** Terminal: hands back the held unboxed value. */
  unbox(): R
  /**
   * Terminal, folding: applies `fn` to the held value and hands back its
   * result. `unbox(undefined)` is an argument, not a zero-arg call
   * (docs/adr/0003-currying.md), and a compile error.
   */
  unbox<U>(fn: (value: R) => U): U
  unbox<U>(fn?: (value: R) => U): R | U {
    return notImplemented(fn)
  }

  /** Terminal: the held unboxed value, as a property read. */
  get result(): R {
    return notImplemented()
  }
}

export const Result = ResultBox
