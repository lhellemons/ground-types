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
 * *is* the `T`. `T extends Error` collapses to `never`, so a `Success` can
 * never itself be an `Error`; that exclusion is what makes the
 * `instanceof Error` discrimination between `Success` and `Failure` sound.
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
type ValueOf<R> =
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
 * subclass instead of routing it through `failure()` — the same value at
 * runtime, since both are identity casts and discrimination is
 * `instanceof Error` — and that arm carries no `_error` handle. Without the
 * fallback its `Failure` arm would be dropped from the error union
 * entirely, which is unsound rather than merely imprecise.
 */
type ErrorOf<R> =
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

/** Wraps a known-good value as a {@link Success}. */
export function success<T, E extends Error = Error>(value: T): Success<T, E> {
  return value as Success<T, E>
}

/** Wraps a known error as a {@link Failure}. */
export function failure<T, E extends Error = Error>(error: E): Failure<T, E> {
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
 * all; this preserves whatever was thrown on `thrown`.
 *
 * `T` defaults to `unknown` because that is what a thrown value is where
 * {@link tryCatch} constructs one: a caller naming this type in an annotation
 * should not have to supply an argument the encoding never knows.
 */
export class ThrownError<T = unknown> extends Error {
  readonly thrown: T

  constructor(thrown: T, message?: string) {
    super(message ?? `threw ${ThrownError.describe(thrown)}`)
    this.thrown = thrown
  }

  /**
   * Renders a failure value for a message without trusting it to be
   * renderable. This Error exists precisely for values that are *not*
   * well-behaved Errors, and one may be a symbol, an object with a null
   * prototype, or one whose `toString` throws. Interpolating such a value
   * directly throws from the constructor, which would turn the lift meant to
   * capture a failure into a second one.
   *
   * `String` is tried first because it is special-cased for symbols, where
   * template interpolation is not; `Object.prototype.toString` is the fallback
   * because it reads no property of the value at all.
   */
  static describe(value: unknown): string {
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
 * The wrapping is what makes the default sound. `throw` accepts any value,
 * and a `Failure` is discriminated by `instanceof Error`, so passing a thrown
 * string straight through would produce a "Result" that {@link isFailure}
 * reads as a `Success` — the failure disappearing into the success channel it
 * was lifted to stay out of.
 *
 * `errorHandler` returns a whole `Result`, not just an `Error`, so it may
 * also recover — turning a throw into a `Success`. This is the same handler
 * shape `promise/resultify` takes for a rejection, which makes `tryCatch` and
 * `resultify` the synchronous and asynchronous forms of one lift, and lets
 * `promise/fail` and `promise/recoverWith` serve both. `promise/fail` is the
 * default's asynchronous twin, down to wrapping a non-`Error` in a
 * `RejectionError` — the same move, named for the channel it happened on.
 *
 * A handler that returns a bare `E` still satisfies it: `Failure<T, E>` is
 * `E` intersected with an optional phantom property, so every `E` is already
 * a `Result<T, E>`.
 *
 * `fn` must resolve synchronously — see {@link NotAPromise}. An `async fn`'s
 * own throw happens after this function's `try`/`catch` has already exited,
 * so `tryCatch` cannot catch it: the returned promise rejects unhandled
 * while {@link isSuccess} reports `true` on it. Lift an async operation with
 * `promise/resultify` or `call/resultify` instead.
 */
export function tryCatch<
  T extends NotAPromise<T>,
  Args extends unknown[],
  E extends Error = Error,
>(
  fn: (...args: Args) => T,
  errorHandler: Mapper<unknown, Result<T, E>> = (error) =>
    // Cast for the same reason the previous default cast: `E` is the caller's
    // to name, and the default cannot know which subclass it was promised.
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
 * the exact `Promise` interface. A non-native thenable (a custom deferred, an
 * older async library) resolves asynchronously exactly like a real `Promise`
 * and traps a caller the same way, so detection goes by shape rather than by
 * `instanceof`/exact-type match. This is the same duck-typing `await` and
 * `Promise.resolve` themselves use.
 */
type IsThenable<T> = T extends { then(...args: never[]): unknown }
  ? true
  : false

/**
 * True when any member of `R` is thenable. Distributes deliberately —
 * unlike {@link ValueOf}/{@link ErrorOf}'s tuple-wrapped checks, which avoid
 * distribution — because a callback return type that is a sync/async union
 * (`(n: number) => number | Promise<number>`, "return a cached value or
 * fetch") is not itself assignable to a thenable as a whole, so only
 * checking the whole union would miss the async arm. `Extract<..., true>`
 * then asks whether the per-member union of booleans contains a `true`
 * anywhere, rather than requiring every member to be thenable.
 */
type HasThenableArm<R> = [
  Extract<R extends unknown ? IsThenable<R> : never, true>,
] extends [never]
  ? false
  : true

/**
 * Rejects a callback return type unsuited to `map`. Surfaces the diagnostic
 * as a readable string rather than a structural mismatch, so the compiler
 * names a fix that actually applies instead of describing the encoding.
 * Exported so its exact wording can be pinned by type-level tests. Three
 * shapes are rejected, each with its own message:
 *
 * - `R` itself is an `Error` subclass — there is no fix, because
 *   `Success<T, E>` collapses to `never` for `T extends Error` (see
 *   docs/adr/0001-unboxed-maybe-and-result.md); a `Success` can never be an
 *   `Error`.
 * - `R` has a thenable arm — nothing in this module otherwise asserts that a
 *   value resolves synchronously, so a `Promise`-returning callback would
 *   type-check silently and produce a `Result` that is itself an unresolved
 *   `Promise`, which {@link isSuccess} reports as `true` regardless of how it
 *   settles. Resolve with `promise/resultify` or `call/resultify` first.
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
 * must return a plain, already-resolved value — not a `Result`, because
 * `Result<Result<T>>` cannot be represented, and not a `Promise`, because
 * `map` runs synchronously. Both are compile errors: the constraint rejects
 * any callback whose return type has an `Error` arm or is a `Promise`. Use
 * {@link andThen} to chain a second fallible step, or resolve an async one
 * first — see {@link NotAResult}.
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
 * unchanged — {@link map}'s dual, over the other channel. Before this
 * existed the failure channel could only be *erased*: {@link orElse} and
 * {@link fallback} both end a chain by turning a `Failure` into a
 * `Success`, so there was no way to translate a factory's error into the
 * caller's own domain error and keep the chain going as a `Result`.
 *
 * `fn` shares the handler vocabulary of {@link tryCatch}'s `errorHandler`
 * and `promise/resultify`'s rejection mapper: it returns a whole `Result`,
 * not just an `Error`. A bare `F` already satisfies that — `Failure<T, F>`
 * is `F` intersected with an optional phantom, so every `Error` is already
 * a `Result` — which makes pure translation the simple case:
 *
 * ```ts
 * mapError((error: FetchError) => new WidgetError(error))
 * ```
 *
 * and recovery (returning a `Success`) available without a second
 * combinator, exactly as it is in those handlers. {@link ValueOf} and
 * {@link ErrorOf} keep the arms precise: a translating callback yields
 * `Result<T, F>`, a recovering one drops the error type it recovered from.
 *
 * `fn` must resolve synchronously — see {@link NotAPromise}.
 *
 * `/maybe` deliberately has no counterpart: `Nothing` carries nothing to
 * transform, which is the same reason `maybe/assertJust` takes a message
 * where `result/assertSuccess` rethrows the carried `Error`.
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
 * {@link HasThenableArm}). `andThen` accepts a callback that returns a
 * `Result`, a raw `Error`, or a plain value that cannot fail — {@link
 * ValueOf} and {@link ErrorOf} handle all three — but a thenable fits none
 * of those cases; it carries no `Error` arm, so it falls through the same
 * path a cannot-fail plain value takes, producing a `Success` that is
 * itself an unresolved `Promise`. Names the sanctioned lift as the fix —
 * resolve with `promise/resultify` or `call/resultify` first, then compose
 * with `.then()`, as documented in the README's "asynchrony layer" section.
 *
 * Exported both so its exact wording can be pinned by type-level tests and
 * for `maybe/map`, which runs synchronously over an unboxed encoding in
 * exactly the same way and would otherwise let an `async` callback mint a
 * `Just` that is an unresolved `Promise`. The import is type-only, so the
 * maybe/result boundary stays free of a runtime cycle
 * (see docs/adr/0001-unboxed-maybe-and-result.md).
 */
export type NotAPromise<R> =
  HasThenableArm<R> extends true
    ? 'This callback returns a Promise (or thenable) — resolve it first with promise/resultify or call/resultify, then compose with .then()'
    : unknown

/**
 * The sanctioned linear-chaining form (see
 * docs/adr/0001-unboxed-maybe-and-result.md): like `map`, but `fn` itself
 * returns a `Result` rather than a plain value, so chaining a second
 * fallible step never nests a `Result<Result<T>>` (unrepresentable in this
 * unboxed encoding) — `fn`'s own failure propagates exactly like the
 * input's, short-circuiting before `fn` ever runs. Unlike `maybe/andThen`,
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
 * Curryable: supply `value` to apply now, or omit it for a Mapper. Arity is
 * doubly load-bearing here: the value being bridged is a `Maybe`, so
 * `fromMaybe(error, nothing())` passes `undefined` as a real argument and
 * must produce the `Failure`, not hand back the Mapper (see
 * docs/adr/0003-currying.md).
 *
 * The applied form's `value` is spelled `T | undefined` rather than
 * `Maybe<T>` — the same type for any admissible `T`, but a spelling the
 * compiler can infer `T` from; see `maybe/map` for the full rationale.
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
