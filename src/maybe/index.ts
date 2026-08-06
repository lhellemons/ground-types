import { curry } from '../fn/index.js'
import type { CurryableMapper } from '../fn/index.js'
import type { NotAPromise, Result } from '../result/index.js'

/**
 * A value that may be absent, encoded unboxed as `T | undefined`. A `Maybe`
 * never wraps another `Maybe`: `Maybe<Maybe<T>>` and `Maybe<T>` are mutually
 * assignable, so nesting is unrepresentable rather than merely discouraged
 * (see docs/adr/0001-unboxed-maybe-and-result.md). Unlike {@link Just} and
 * {@link Nothing}, the type argument is required.
 */
export type Maybe<T> = T extends undefined ? never : T | undefined

/**
 * The present case of a {@link Maybe} — the value itself, unwrapped.
 *
 * `T` defaults to `unknown` so the name can be written bare, as a matched
 * pair with {@link Nothing} — but a bare `Just` is plain `unknown`, a
 * reading for humans that the checker cannot enforce (it cannot exclude
 * `undefined` without knowing `T`). Name the argument when it matters.
 */
export type Just<T = unknown> = T extends undefined ? never : T

/**
 * The absent case of a {@link Maybe} — always `undefined` at runtime.
 *
 * `T` defaults to `unknown` so `Nothing` can be written bare in an
 * annotation, where it evaluates to exactly `undefined`; the phantom `T`
 * only relates a `Nothing` to the `Maybe` it came from.
 */
export type Nothing<T = unknown> = T extends undefined ? never : undefined

/**
 * Wraps a possibly-absent value as a {@link Maybe}. Reach for this at the
 * boundary where a `T | undefined` enters code that deals in `Maybe`, e.g.
 * the result of `Array.prototype.find` or an optional property read. For an
 * API that signals absence with `null` instead, use {@link fromNullable} —
 * to this function a `null` is a value, and becomes a `Just`.
 */
export function maybe<T>(value: T | undefined): Maybe<T> {
  return value as Maybe<T>
}

/**
 * Wraps a value from a null-convention API (`querySelector`,
 * `RegExp.prototype.exec`, a JSON field) as a {@link Maybe}, folding both
 * `null` and `undefined` to `Nothing`. To {@link maybe} a `null` is a value
 * and becomes a `Just` — the encoding knows only one absence (see
 * docs/adr/0001-unboxed-maybe-and-result.md). The return type is
 * `Maybe<NonNullable<T>>`, so downstream code never sees a `null` again.
 */
export function fromNullable<T>(
  value: T | null | undefined,
): Maybe<NonNullable<T>> {
  return (value ?? undefined) as Maybe<NonNullable<T>>
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
 *
 * Curryable: supply `value` to apply now, or omit it for a Mapper — decided
 * by arity, never by inspecting the value: `orElse(0, nothing())` passes
 * `undefined` as a real argument and applies (see
 * docs/adr/0003-currying.md).
 */
export function orElse<T>(defaultValue: T, value: T | undefined): Just<T>
export function orElse<T>(defaultValue: T): (value: Maybe<T>) => Just<T>
export function orElse<T>(
  defaultValue: T,
  ...value: [] | [Maybe<T>]
): CurryableMapper<Maybe<T>, Just<T>> {
  return curry(
    (value: Maybe<T>) => (isJust(value) ? value : defaultValue) as Just<T>,
    ...value,
  )
}

/**
 * Lazy counterpart to {@link orElse}: `fn` runs only when the input is
 * `Nothing`, so use this when producing the default has a cost worth
 * avoiding on the `Just` path.
 *
 * Curryable: supply `value` to apply now, or omit it for a Mapper — decided
 * by arity, never by inspecting the value (see docs/adr/0003-currying.md).
 */
export function fallback<T>(fn: () => T, value: T | undefined): Just<T>
export function fallback<T>(fn: () => T): (value: Maybe<T>) => Just<T>
export function fallback<T>(
  fn: () => T,
  ...value: [] | [Maybe<T>]
): CurryableMapper<Maybe<T>, Just<T>> {
  return curry(
    (value: Maybe<T>) => (isJust(value) ? value : fn()) as Just<T>,
    ...value,
  )
}

/**
 * Applies `fn` to a `Just`, passing `Nothing` through unchanged. Because
 * `Maybe<Maybe<U>>` and `Maybe<U>` are mutually assignable, `fn` may itself
 * return a `Maybe<U>` without ever producing an observable nested value —
 * which is exactly what {@link andThen} relies on.
 *
 * `fn` must resolve synchronously — the same rule `result/map` enforces,
 * through the same `NotAPromise` guard. Resolve with `promise/resultify`
 * or `call/resultify` first, then compose with `.then()`.
 *
 * Curryable: supply `value` to apply now, or omit it for a Mapper — decided
 * by arity, never by inspecting the value: `map(fn, nothing())` passes
 * `undefined` as a real argument and applies, not hands back the Mapper
 * (see docs/adr/0003-currying.md).
 *
 * The applied form's `value` — here and on every applied form in this
 * module — is spelled `T | undefined` rather than `Maybe<T>` so the
 * compiler can infer `T` from it (see docs/adr/0003-currying.md).
 */
export function map<T, U extends NotAPromise<U>>(
  fn: (value: Just<T>) => U,
  value: T | undefined,
): Maybe<U>
export function map<T, U extends NotAPromise<U>>(
  fn: (value: Just<T>) => U,
): (value: Maybe<T>) => Maybe<U>
export function map<T, U extends NotAPromise<U>>(
  fn: (value: Just<T>) => U,
  ...value: [] | [Maybe<T>]
): CurryableMapper<Maybe<T>, Maybe<U>> {
  return curry(
    (value: Maybe<T>) => (isJust(value) ? maybe(fn(value)) : nothing()),
    ...value,
  )
}

/**
 * The linear-chaining form, kept for symmetry with `result/andThen` so
 * generic code can treat both modules alike. For `Maybe` it is a true
 * alias of {@link map} — the same function, in types and at runtime —
 * because `Maybe<Maybe<U>>` *is* `Maybe<U>`, leaving nothing for a
 * separate chaining step to flatten. Contrast with `result/andThen`, which
 * is NOT an alias of `result/map` (see
 * docs/adr/0001-unboxed-maybe-and-result.md).
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
