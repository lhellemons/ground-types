declare const _phantom: unique symbol

export type Success<T, E extends Error = Error> = (T extends Error
  ? never
  : T) & { readonly [_phantom]?: E }
export type Failure<T, E extends Error = Error> = E & {
  readonly [_phantom]?: T
}
export type Result<T, E extends Error = Error> = Success<T, E> | Failure<T, E>

export function result<T, E extends Error = Error>(value: T | E): Result<T, E> {
  return value as unknown as Result<T, E>
}
export function success<T, E extends Error = Error>(value: T): Success<T, E> {
  return value as Success<T, E>
}
export function failure<T, E extends Error = Error>(error: E): Failure<T, E> {
  return error as Failure<T, E>
}

export function isSuccess<T, E extends Error = Error>(
  value: Result<T, E>,
): value is Success<T, E> {
  return value instanceof Error === false
}
export function isFailure<T, E extends Error = Error>(
  value: Result<T, E>,
): value is Failure<T, E> {
  return value instanceof Error === true
}

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

export function assertSuccess<T, E extends Error = Error>(
  value: T | E,
): Success<T, E> {
  if (value instanceof Error) {
    throw value
  }
  return value as Success<T, E>
}

export function map<T, U, E extends Error = Error>(
  fn: (value: Success<T, E>) => U,
): (value: Result<T, E>) => Result<U, E> {
  return (value: Result<T, E>) =>
    isSuccess(value)
      ? result<U, E>(fn(value))
      : (value as unknown as Failure<U, E>)
}

export function fallback<T, E extends Error = Error>(
  fn: (error: Failure<T, E>) => Success<T, E>,
): (value: Result<T, E>) => Success<T, E> {
  return (value: Result<T, E>) => (isSuccess(value) ? value : fn(value))
}

/**
 * The sanctioned linear-chaining form (ADR-0016): like `map`, but `fn`
 * itself returns a `Result` rather than a plain value, so chaining a second
 * fallible step never nests a `Result<Result<T>>` (unrepresentable in this
 * unboxed encoding) — `fn`'s own failure propagates exactly like the
 * input's, short-circuiting before `fn` ever runs.
 */
export function andThen<T, U, E extends Error = Error>(
  fn: (value: Success<T, E>) => Result<U, E>,
): (value: Result<T, E>) => Result<U, E> {
  return (value: Result<T, E>) =>
    isSuccess(value) ? fn(value) : (value as unknown as Failure<U, E>)
}
