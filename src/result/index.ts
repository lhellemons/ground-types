import type { Maybe } from '../maybe/index.js'
import { curry } from '../fn/index.js'
import type { CurryableMapper, Mapper } from '../fn/index.js'

declare const _phantom: unique symbol

/* Inference handles. `Success`'s value sits behind a conditional type and
   `Failure`'s error behind an intersection, and TypeScript can infer through
   neither — which is why combinators that tried to pattern-match `Result<U, E>`
   at an inference site silently produced `unknown`. These optional markers give
   `ValueOf`/`ErrorOf` a plain position to `infer` from. Like `_phantom` they are
   compile-time only and never present on a value. */
declare const _value: unique symbol
declare const _error: unique symbol

/**
 * The value-carrying case of a {@link Result}, unboxed — a `Success<T>`
 * *is* the `T`. A `Success` can never itself be an `Error`: `T extends
 * Error` collapses to `never` (see docs/adr/0001-unboxed-maybe-and-result.md).
 */
export type Success<T, E extends Error = Error> = (T extends Error
  ? never
  : T) & { readonly [_phantom]?: E; readonly [_value]?: T }

/**
 * The `Error`-carrying case of a {@link Result}, unboxed — a `Failure` *is*
 * the `Error`, keeping its concrete subclass so a caller can branch on the
 * specific error type it was given.
 */
export type Failure<T, E extends Error = Error> = E & {
  readonly [_phantom]?: T
  readonly [_error]?: E
}

/**
 * Recovers the value type carried by a {@link Success} arm, discarding any
 * {@link Failure} arms. Used to type a combinator's output from whatever its
 * callback actually returned, rather than inferring into `Result<U, E>`.
 */
// PROTOTYPE (#49): exported on this branch only, so the Box declaration in
// prototype/result-chain-error-union.ts can restate member types with the
// real helpers. The phantom-handle symbols are module-private, so a Box
// outside this file cannot otherwise see them — a constraint for #44.
export type ValueOf<R> =
  Exclude<R, Error> extends infer S
    ? S extends { readonly [_value]?: infer U }
      ? // A plain value carries no `_value` handle, so `U` infers as
        // `unknown`; fall back to the value's own type. Without this a
        // callback that cannot fail loses its Success type entirely.
        unknown extends U
        ? S
        : U
      : S
    : never

/**
 * Recovers the `Error` type carried by a {@link Failure} arm, if any.
 * Mirrors {@link ValueOf}'s fallback: a callback may return a raw `Error`
 * subclass instead of routing it through `failure()`, and that arm carries
 * no `_error` handle — without the fallback it would be dropped from the
 * error union entirely.
 */
// PROTOTYPE (#49): see ValueOf above.
export type ErrorOf<R> =
  Extract<R, Error> extends infer S
    ? S extends Error
      ? // A raw `Error` subclass matches neither the `_error` handle (weak
        // type detection rejects it — it shares no property with the marker)
        // nor `infer F`, so every path that isn't a real handle falls back
        // to `S`, which `Extract` already proved is an `Error`.
        S extends { readonly [_error]?: infer F }
        ? unknown extends F
          ? S
          : F extends Error
            ? F
            : S
        : S
      : never
    : never

/**
 * The outcome of a fallible operation: either a {@link Success} carrying
 * the value or a {@link Failure} carrying an `Error`, discriminated by
 * `instanceof Error`. Unlike `Maybe`, a `Result` genuinely cannot nest:
 * `Result<Result<T>>` is a distinct type, not assignable back to
 * `Result<T>` — see docs/adr/0001-unboxed-maybe-and-result.md.
 */
export type Result<T, E extends Error = Error> = Success<T, E> | Failure<T, E>

/**
 * Wraps a value-or-error as a {@link Result}. Reach for this at the
 * boundary where a `T | E` enters code that deals in `Result`.
 */
export function result<T, E extends Error = Error>(value: T | E): Result<T, E> {
  return value as unknown as Result<T, E>
}

/**
 * Wraps a known-good value as a {@link Success}. Type parameters are
 * value-first: `success<Widget>(w)` names the value being wrapped.
 * {@link failure} orders its parameters the other way round.
 */
export function success<T, E extends Error = Error>(value: T): Success<T, E> {
  return value as Success<T, E>
}

/**
 * Wraps a known error as a {@link Failure}. Type parameters are ordered
 * `<E, T>` — the reverse of {@link success} and of the `Result`/`Failure`
 * types themselves: `failure<MyError>(e)` names the error being wrapped,
 * leaving the phantom channel defaulted.
 */
export function failure<E extends Error = Error, T = unknown>(
  error: E,
): Failure<T, E> {
  return error
}

/** Type guard: true when `value` is a {@link Success}, narrowing to it. */
export function isSuccess<T, E extends Error = Error>(
  value: Result<T, E>,
): value is Success<T, E> {
  return value instanceof Error === false
}

/** Type guard: true when `value` is a {@link Failure}, narrowing to it. */
export function isFailure<T, E extends Error = Error>(
  value: Result<T, E>,
): value is Failure<T, E> {
  return value instanceof Error === true
}

/**
 * The Error a failure value is wrapped in when it was not already an `Error`.
 * A {@link Failure} must carry an `Error`, and `throw` accepts anything at
 * all; this preserves whatever was thrown on `thrown`. Constructed by
 * {@link tryCatch}'s default handler. The asynchronous counterpart is
 * `promise/RejectionError`.
 */
export class ThrownError<T = unknown> extends Error {
  readonly thrown: T

  constructor(thrown: T, message?: string) {
    super(message ?? `threw ${ThrownError.describe(thrown)}`)
    this.thrown = thrown
  }

  /**
   * Renders a failure value for a message without trusting it to be
   * renderable: the value may be a symbol, an object with a null prototype,
   * or one whose `toString` throws, and this never throws for any of them.
   */
  static describe(value: unknown): string {
    // `String` first: it is special-cased for symbols, where template
    // interpolation throws. `Object.prototype.toString` is the fallback
    // because it reads no property of the value at all.
    try {
      return String(value)
    } catch {
      return Object.prototype.toString.call(value)
    }
  }
}

/**
 * Lifts a throwing function into one that returns a {@link Result}. The
 * default `errorHandler` keeps an `Error` as it was thrown, with its concrete
 * subclass intact, and wraps anything else in a {@link ThrownError}; supply
 * one to translate the caught error into a specific `Error` subclass, or to
 * recover from it.
 *
 * `errorHandler` returns a whole `Result`, not just an `Error`, so it may
 * also recover — turning a throw into a `Success`. A handler that returns a
 * bare `E` still satisfies it: every `E` is already a `Result<T, E>`. This
 * is the same handler shape `promise/resultify` takes for a rejection —
 * `tryCatch` and `resultify` are the synchronous and asynchronous forms of
 * one lift, and `promise/fail` and `promise/recoverWith` serve both.
 *
 * `fn` must resolve synchronously — see {@link NotAPromise}. Lift an async
 * operation with `promise/resultify` or `call/resultify` instead.
 *
 * Naming `E` explicitly requires supplying the handler that produces it:
 * `tryCatch(fn)` fixes `E = Error`, and no overload takes three type
 * arguments with one value argument.
 */
export function tryCatch<T extends NotAPromise<T>, Args extends unknown[]>(
  fn: (...args: Args) => T,
): (...args: Args) => Result<T, Error>
export function tryCatch<
  T extends NotAPromise<T>,
  Args extends unknown[],
  E extends Error = Error,
>(
  fn: (...args: Args) => T,
  errorHandler: Mapper<unknown, Result<T, E>>,
): (...args: Args) => Result<T, E>
export function tryCatch<
  T extends NotAPromise<T>,
  Args extends unknown[],
  E extends Error = Error,
>(
  fn: (...args: Args) => T,
  errorHandler: Mapper<unknown, Result<T, E>> = (error) =>
    // The implementation signature is still generic in `E`, so the default
    // still needs the cast — but the handler-less overload above pins
    // `E = Error` at every call site that can reach it, which is what the
    // cast then truthfully claims.
    (error instanceof Error ? error : new ThrownError(error)) as Failure<T, E>,
): (...args: Args) => Result<T, E> {
  return function (...args: Args) {
    try {
      return fn(...args) as Result<T, E>
    } catch (error) {
      return errorHandler(error)
    }
  }
}

/**
 * Asserts that `value` is a {@link Success}, returning it or throwing the
 * carried `Error` otherwise. Mirrors `maybe/assertJust`, but here the thrown
 * value is the `Failure` itself — there is no separate message to supply.
 */
export function assertSuccess<T, E extends Error = Error>(
  value: T | E,
): Success<T, E> {
  if (value instanceof Error) {
    throw value
  }
  return value as Success<T, E>
}

/**
 * True when `T` is thenable — has a callable `then` — rather than requiring
 * the exact `Promise` interface: the same duck-typing `await` and
 * `Promise.resolve` themselves use, so a non-native thenable is caught too.
 */
type IsThenable<T> = T extends { then(...args: never[]): unknown }
  ? true
  : false

/**
 * True when any member of `R` is thenable. Distributes over the union so a
 * sync/async return type (`number | Promise<number>`) is caught by its
 * async arm, which the union as a whole would miss.
 */
type HasThenableArm<R> = [
  Extract<R extends unknown ? IsThenable<R> : never, true>,
] extends [never]
  ? false
  : true

/**
 * Rejects a callback return type unsuited to `map`, surfacing the
 * diagnostic as a readable string. Exported so its exact wording can be
 * pinned by type-level tests. Three shapes are rejected, each with its own
 * message:
 *
 * - `R` itself is an `Error` subclass — a `Success` can never be an `Error`
 *   (see docs/adr/0001-unboxed-maybe-and-result.md).
 * - `R` has a thenable arm — resolve with `promise/resultify` or
 *   `call/resultify` first.
 * - `R` has a `Failure` arm alongside other arms — the callback returns a
 *   {@link Result}, and `andThen` is the fix.
 */
export type NotAResult<R> = [R] extends [Error]
  ? 'A Success can never be an Error — see docs/adr/0001-unboxed-maybe-and-result.md'
  : [Extract<R, Error>] extends [never]
    ? HasThenableArm<R> extends true
      ? 'This callback returns a Promise (or thenable) — resolve it first with promise/resultify or call/resultify, then compose with .then()'
      : unknown
    : 'This callback returns a Result — use andThen, not map'

/**
 * Applies `fn` to a `Success`, passing a `Failure` through unchanged. `fn`
 * must return a plain, already-resolved value — not a `Result` and not a
 * `Promise`; both are compile errors (see {@link NotAResult}). Use
 * {@link andThen} to chain a second fallible step, or resolve an async one
 * first.
 *
 * Curryable: supply `value` to apply now, or omit it for a Mapper — decided
 * by arity, never by inspecting the value (see docs/adr/0003-currying.md).
 * The unapplied form stays *generic*: `T` and `E` bind at the eventual
 * application, not at `map(fn)`, so one `map(double)` slots into chains over
 * any error type without re-annotation. The applied form binds them from
 * `value` directly.
 */
export function map<A, U extends NotAResult<U>, T extends A, E extends Error>(
  fn: (value: A) => U,
  value: Result<T, E>,
): Result<U, E>
export function map<A, U extends NotAResult<U>>(
  fn: (value: A) => U,
): <T extends A, E extends Error = Error>(value: Result<T, E>) => Result<U, E>
export function map<A, U extends NotAResult<U>, T extends A, E extends Error>(
  fn: (value: A) => U,
  ...value: [] | [Result<T, E>]
): CurryableMapper<Result<T, E>, Result<U, E>> {
  return curry(
    (value: Result<T, E>) =>
      (isSuccess(value) ? result(fn(value)) : value) as unknown as Result<U, E>,
    ...value,
  )
}

/**
 * Applies `fn` to a `Failure`'s `Error`, passing a `Success` through
 * unchanged — {@link map}'s dual, over the other channel. The one
 * combinator that transforms the failure channel while staying in it:
 * {@link orElse} and {@link fallback} both end a chain by turning a
 * `Failure` into a `Success`, where `mapError` keeps the chain going as
 * a `Result`.
 *
 * `fn` shares the handler shape of {@link tryCatch}'s `errorHandler` and
 * `promise/resultify`'s rejection mapper: it returns a whole `Result`, so
 * it may recover by returning a `Success`, and a bare `F` satisfies it —
 * pure translation is just:
 *
 * ```ts
 * mapError((error: FetchError) => new WidgetError(error))
 * ```
 *
 * The result type tracks the arms `fn` actually has: a translating
 * callback yields `Result<T, F>`, a recovering one drops the error type it
 * recovered from.
 *
 * `fn` must resolve synchronously — see {@link NotAPromise}.
 *
 * `/maybe` has no counterpart: `Nothing` carries nothing to transform.
 *
 * Curryable: supply `value` to apply now, or omit it for a Mapper — decided
 * by arity, never by inspecting the value (see docs/adr/0003-currying.md).
 * Like {@link map}, the unapplied form stays generic: `T` and `E` bind at
 * the eventual application.
 */
export function mapError<
  A extends Error,
  R extends NotAPromise<R>,
  T,
  E extends A,
>(fn: (error: A) => R, value: Result<T, E>): Result<T | ValueOf<R>, ErrorOf<R>>
export function mapError<A extends Error, R extends NotAPromise<R>>(
  fn: (error: A) => R,
): <T, E extends A>(value: Result<T, E>) => Result<T | ValueOf<R>, ErrorOf<R>>
export function mapError<
  A extends Error,
  R extends NotAPromise<R>,
  T,
  E extends A,
>(
  fn: (error: A) => R,
  ...value: [] | [Result<T, E>]
): CurryableMapper<Result<T, E>, Result<T | ValueOf<R>, ErrorOf<R>>> {
  return curry(
    (value: Result<T, E>) =>
      (isFailure(value) ? fn(value) : value) as unknown as Result<
        T | ValueOf<R>,
        ErrorOf<R>
      >,
    ...value,
  )
}

/**
 * Lazy recovery from a `Failure`: `fn` receives the `Failure` and must
 * produce a `Success`, so the result is always a `Success`. Passes an
 * existing `Success` through without calling `fn`. Eager counterpart:
 * {@link orElse}. To transform the error while staying in the failure
 * channel, use {@link mapError}.
 *
 * Curryable: supply `value` to apply now, or omit it for a Mapper — decided
 * by arity, never by inspecting the value (see docs/adr/0003-currying.md).
 */
export function fallback<T, E extends Error>(
  fn: (error: Failure<T, E>) => Success<T, E>,
  value: Result<T, E>,
): Success<T, E>
export function fallback<T, E extends Error = Error>(
  fn: (error: Failure<T, E>) => Success<T, E>,
): (value: Result<T, E>) => Success<T, E>
export function fallback<T, E extends Error>(
  fn: (error: Failure<T, E>) => Success<T, E>,
  ...value: [] | [Result<T, E>]
): CurryableMapper<Result<T, E>, Success<T, E>> {
  return curry(
    (value: Result<T, E>): Success<T, E> =>
      isSuccess(value) ? value : fn(value),
    ...value,
  )
}

/**
 * Eager counterpart to {@link fallback}: substitutes `defaultValue` for a
 * `Failure`, discarding the error. `defaultValue` is not lazily computed —
 * reach for `fallback` when producing it has a cost worth avoiding on the
 * `Success` path.
 *
 * Curryable: supply `value` to apply now, or omit it for a Mapper — decided
 * by arity, never by inspecting the value (see docs/adr/0003-currying.md).
 */
export function orElse<T, E extends Error>(
  defaultValue: T,
  value: Result<T, E>,
): Success<T, E>
export function orElse<T, E extends Error = Error>(
  defaultValue: T,
): (value: Result<T, E>) => Success<T, E>
export function orElse<T, E extends Error>(
  defaultValue: T,
  ...value: [] | [Result<T, E>]
): CurryableMapper<Result<T, E>, Success<T, E>> {
  return curry(
    (value: Result<T, E>): Success<T, E> =>
      isSuccess(value) ? value : success<T, E>(defaultValue),
    ...value,
  )
}

/**
 * Rejects a callback return type with a thenable arm (see
 * {@link HasThenableArm}). The diagnostic names the fix: resolve with
 * `promise/resultify` or `call/resultify` first, then compose with
 * `.then()`.
 *
 * Exported both so its exact wording can be pinned by type-level tests and
 * for `maybe/map`, which enforces the same synchronous-only rule. That
 * import is type-only, keeping the maybe/result boundary free of a runtime
 * cycle (see docs/adr/0001-unboxed-maybe-and-result.md).
 */
export type NotAPromise<R> =
  HasThenableArm<R> extends true
    ? 'This callback returns a Promise (or thenable) — resolve it first with promise/resultify or call/resultify, then compose with .then()'
    : unknown

/**
 * The linear-chaining form (see docs/adr/0001-unboxed-maybe-and-result.md):
 * like `map`, but `fn` itself returns a `Result` rather than a plain value,
 * so chaining a second fallible step never nests a `Result<Result<T>>`.
 * A `Failure` input short-circuits before `fn` ever runs, and `fn`'s own
 * failure propagates exactly like the input's. Unlike `maybe/andThen`,
 * this is genuinely distinct from `map`, not an alias of it.
 *
 * `fn` must resolve synchronously — see {@link NotAPromise}.
 *
 * Curryable: supply `value` to apply now, or omit it for a Mapper — decided
 * by arity, never by inspecting the value (see docs/adr/0003-currying.md).
 * Like {@link map}, the unapplied form stays generic — `T` and `E` bind at
 * the eventual application — and the applied form binds them from `value`.
 */
export function andThen<
  A,
  R extends NotAPromise<R>,
  T extends A,
  E extends Error,
>(fn: (value: A) => R, value: Result<T, E>): Result<ValueOf<R>, E | ErrorOf<R>>
export function andThen<A, R extends NotAPromise<R>>(
  fn: (value: A) => R,
): <T extends A, E extends Error = Error>(
  value: Result<T, E>,
) => Result<ValueOf<R>, E | ErrorOf<R>>
export function andThen<
  A,
  R extends NotAPromise<R>,
  T extends A,
  E extends Error,
>(
  fn: (value: A) => R,
  ...value: [] | [Result<T, E>]
): CurryableMapper<Result<T, E>, Result<ValueOf<R>, E | ErrorOf<R>>> {
  return curry(
    (value: Result<T, E>) =>
      (isSuccess(value) ? fn(value) : value) as unknown as Result<
        ValueOf<R>,
        E | ErrorOf<R>
      >,
    ...value,
  )
}

/**
 * Bridges from `Maybe` to `Result`: a `Just` becomes `Success`, `Nothing`
 * becomes a `Failure` carrying the supplied `error`. Reach for this at the
 * point an absent value needs to be reported as a specific failure reason
 * rather than silently propagated as `Nothing`.
 *
 * Curryable: supply `value` to apply now, or omit it for a Mapper — decided
 * by arity, never by inspecting the value: `fromMaybe(error, nothing())`
 * passes `undefined` as a real argument and produces the `Failure`, not
 * the Mapper (see docs/adr/0003-currying.md).
 *
 * The applied form's `value` is spelled `T | undefined` rather than
 * `Maybe<T>` so the compiler can infer `T` from it (see
 * docs/adr/0003-currying.md).
 */
export function fromMaybe<T, E extends Error>(
  error: E,
  value: T | undefined,
): Result<T, E>
export function fromMaybe<T, E extends Error = Error>(
  error: E,
): (value: Maybe<T>) => Result<T, E>
export function fromMaybe<T, E extends Error>(
  error: E,
  ...value: [] | [Maybe<T>]
): CurryableMapper<Maybe<T>, Result<T, E>> {
  // Inlined rather than calling `isNothing` from ../maybe: that guard is a
  // runtime import, and this bridge must stay type-only across the
  // maybe/result boundary or the two modules form a real import cycle
  // (see docs/adr/0001-unboxed-maybe-and-result.md).
  return curry(
    (value: Maybe<T>) =>
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Maybe<T>'s conditional can't reduce for generic T; see maybe/isJust
      (value === undefined ? failure(error) : success(value)) as Result<T, E>,
    ...value,
  )
}
