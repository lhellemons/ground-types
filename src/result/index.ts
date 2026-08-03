import type { Maybe } from '../maybe/index.js'

declare const _phantom: unique symbol

/**
 * The value-carrying case of a {@link Result}, unboxed — a `Success<T>`
 * *is* the `T`. `T extends Error` collapses to `never`, so a `Success` can
 * never itself be an `Error`; that exclusion is what makes the
 * `instanceof Error` discrimination between `Success` and `Failure` sound.
 */
export type Success<T, E extends Error = Error> = (T extends Error
  ? never
  : T) & { readonly [_phantom]?: E }

/**
 * The `Error`-carrying case of a {@link Result}, unboxed — a `Failure` *is*
 * the `Error`, keeping its concrete subclass so a caller can branch on the
 * specific error type it was given.
 */
export type Failure<T, E extends Error = Error> = E & {
  readonly [_phantom]?: T
}

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
  return error as Failure<T, E>
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
 * Lifts a throwing function into one that returns a {@link Result}. The
 * default `errorHandler` passes the thrown value through unchanged (cast to
 * `E`); supply one to normalise non-`Error` throws or to translate the
 * caught error into a specific `Error` subclass.
 */
export function tryCatch<T, Args extends unknown[], E extends Error = Error>(
  fn: (...args: Args) => T,
  errorHandler: (error: unknown) => E = (error) => error as E,
): (...args: Args) => Result<T, E> {
  return function (...args: Args) {
    try {
      return fn(...args) as Result<T, E>
    } catch (error) {
      return errorHandler(error) as unknown as Failure<T, E>
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
 * Applies `fn` to a `Success`, passing a `Failure` through unchanged. `fn`
 * must return a plain value, not a `Result` — because `Result<Result<T>>`
 * cannot be represented, running a `Result`-returning callback through
 * `map` is a trap, not a shortcut. Use {@link andThen} to chain a second
 * fallible step.
 */
export function map<T, U, E extends Error = Error>(
  fn: (value: Success<T, E>) => U,
): (value: Result<T, E>) => Result<U, E> {
  return (value: Result<T, E>) =>
    isSuccess(value)
      ? result<U, E>(fn(value))
      : (value as unknown as Failure<U, E>)
}

/**
 * Lazy recovery from a `Failure`: `fn` receives the `Failure` and must
 * produce a `Success`, so the result is always a `Success`. Passes an
 * existing `Success` through without calling `fn`. Eager counterpart:
 * {@link orElse}.
 */
export function fallback<T, E extends Error = Error>(
  fn: (error: Failure<T, E>) => Success<T, E>,
): (value: Result<T, E>) => Success<T, E> {
  return (value: Result<T, E>) => (isSuccess(value) ? value : fn(value))
}

/**
 * Eager counterpart to {@link fallback}: substitutes `defaultValue` for a
 * `Failure`, discarding the error. `defaultValue` is not lazily computed —
 * reach for `fallback` when producing it has a cost worth avoiding on the
 * `Success` path.
 */
export function orElse<T, E extends Error = Error>(
  defaultValue: T,
): (value: Result<T, E>) => Success<T, E> {
  return (value: Result<T, E>) =>
    isSuccess(value) ? value : success(defaultValue)
}

/**
 * The sanctioned linear-chaining form (see
 * docs/adr/0001-unboxed-maybe-and-result.md): like `map`, but `fn` itself
 * returns a `Result` rather than a plain value, so chaining a second
 * fallible step never nests a `Result<Result<T>>` (unrepresentable in this
 * unboxed encoding) — `fn`'s own failure propagates exactly like the
 * input's, short-circuiting before `fn` ever runs. Unlike `maybe/andThen`,
 * this is genuinely distinct from `map`, not an alias of it.
 */
export function andThen<T, U, E extends Error = Error>(
  fn: (value: Success<T, E>) => Result<U, E>,
): (value: Result<T, E>) => Result<U, E> {
  return (value: Result<T, E>) =>
    isSuccess(value) ? fn(value) : (value as unknown as Failure<U, E>)
}

/**
 * Bridges from `Maybe` to `Result`: a `Just` becomes `Success`, `Nothing`
 * becomes a `Failure` carrying the supplied `error`. Reach for this at the
 * point an absent value needs to be reported as a specific failure reason
 * rather than silently propagated as `Nothing`.
 */
export function fromMaybe<T, E extends Error = Error>(
  error: E,
): (value: Maybe<T>) => Result<T, E> {
  // Inlined rather than calling `isNothing` from ../maybe: that guard is a
  // runtime import, and this bridge must stay type-only across the
  // maybe/result boundary or the two modules form a real import cycle
  // (see docs/adr/0001-unboxed-maybe-and-result.md).
  return (value: Maybe<T>) =>
    (value === undefined ? failure(error) : success(value)) as Result<T, E>
}
