import type { Result } from '../result/index.js'

/**
 * A value that may be absent, encoded unboxed as `T | undefined`. A `Maybe`
 * never wraps another `Maybe`: `Maybe<Maybe<T>>` and `Maybe<T>` are mutually
 * assignable, so nesting is unrepresentable rather than merely discouraged.
 */
export type Maybe<T> = T extends undefined ? never : T | undefined

/** The present case of a {@link Maybe} — the value itself, unwrapped. */
export type Just<T> = T extends undefined ? never : T

/** The absent case of a {@link Maybe} — always `undefined` at runtime. */
export type Nothing<T> = T extends undefined ? never : undefined

/**
 * Wraps a possibly-absent value as a {@link Maybe}. Reach for this at the
 * boundary where a `T | undefined` enters code that deals in `Maybe`, e.g.
 * the result of `Array.prototype.find` or an optional property read.
 */
export function maybe<T>(value: T | undefined): Maybe<T> {
  return value as Maybe<T>
}

/** Wraps a known-present value as a {@link Just}. */
export function just<T>(value: T): Just<T> {
  return value as Just<T>
}

/** Produces the absent case of a {@link Maybe} for a given `T`. */
export function nothing<T>(): Nothing<T> {
  return undefined as Nothing<T>
}

/** Type guard: true when `value` is present, narrowing to {@link Just}. */
export function isJust<T>(value: Maybe<T>): value is Just<T> {
  // `Maybe<T>`'s conditional can't reduce for a generic `T`, so the checker
  // treats `value` as never (or always) `undefined` here — a false
  // positive, not a redundant check: the runtime comparison is exactly
  // what makes the narrowing sound.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  return value !== undefined
}

/** Type guard: true when `value` is absent, narrowing to {@link Nothing}. */
export function isNothing<T>(value: Maybe<T>): value is Nothing<T> {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- see isJust
  return value === undefined
}

/**
 * Substitutes an eager default for `Nothing`, passing a `Just` through
 * unchanged. `defaultValue` is computed up front even when the input turns
 * out to be present; use {@link fallback} when computing it is not free.
 */
export function orElse<T>(defaultValue: T): (value: Maybe<T>) => Just<T> {
  return (value: Maybe<T>) => (isJust(value) ? value : defaultValue) as Just<T>
}

/**
 * Lazy counterpart to {@link orElse}: `fn` runs only when the input is
 * `Nothing`, so use this when producing the default has a cost worth
 * avoiding on the `Just` path.
 */
export function fallback<T>(fn: () => T): (value: Maybe<T>) => Just<T> {
  return (value: Maybe<T>) => (isJust(value) ? value : fn()) as Just<T>
}

/**
 * Applies `fn` to a `Just`, passing `Nothing` through unchanged. Because
 * `Maybe<Maybe<U>>` and `Maybe<U>` are mutually assignable, `fn` may itself
 * return a `Maybe<U>` without ever producing an observable nested value —
 * which is exactly what {@link andThen} relies on.
 */
export function map<T, U>(
  fn: (value: Just<T>) => U,
): (value: Maybe<T>) => Maybe<U> {
  return (value: Maybe<T>) => (isJust(value) ? maybe(fn(value)) : nothing())
}

/**
 * The linear-chaining form, kept for symmetry with `result/andThen` so
 * generic code can treat both modules alike. For `Maybe` it is a true
 * alias of {@link map} — the same function, in types and at runtime — not
 * a distinct implementation: a `Maybe<U>`-returning callback run through
 * `map` yields `Maybe<Maybe<U>>`, which *is* `Maybe<U>`, so there is
 * nothing left for a separate chaining step to flatten. Contrast with
 * `result/andThen`, which is NOT an alias of `result/map` because
 * `Result<Result<T>>` is a distinct, unrepresentable-as-nested type.
 */
export const andThen = map

/**
 * Asserts that `value` is present, returning it as a {@link Just} or
 * throwing otherwise. Mirrors `result/assertSuccess`, but a `Nothing`
 * carries no error to rethrow, so `message` (or a sensible default) becomes
 * the thrown `Error`'s message.
 */
export function assertJust<T>(value: Maybe<T>, message?: string): Just<T> {
  if (isNothing(value)) {
    throw new Error(message ?? 'expected Just, got Nothing')
  }
  return value as Just<T>
}

/**
 * Bridges from `Result` to `Maybe`, discarding the error: a `Success`
 * becomes `Just`, a `Failure` becomes `Nothing`. Reach for this when a
 * caller only cares whether a fallible operation produced a value, not why
 * it didn't.
 */
export function fromResult<T, E extends Error = Error>(
  value: Result<T, E>,
): Maybe<T> {
  // Inlined rather than calling `isFailure` from ../result: that guard is a
  // runtime import, and this bridge must stay type-only across the
  // maybe/result boundary or the two modules form a real import cycle
  // (see docs/adr/0001-unboxed-maybe-and-result.md).
  return (value instanceof Error ? undefined : value) as Maybe<T>
}
