import { curry } from '../fn/index.js'
import type { CurryableMapper } from '../fn/index.js'
import type { NotAPromise, Result } from '../result/index.js'

/**
 * A value that may be absent, encoded unboxed as `T | undefined`. A `Maybe`
 * never wraps another `Maybe`: `Maybe<Maybe<T>>` and `Maybe<T>` are mutually
 * assignable, so nesting is unrepresentable rather than merely discouraged.
 *
 * Deliberately the only one of the three without a default type argument,
 * where {@link Just} and {@link Nothing} both default to `unknown`. A bare
 * `Maybe` would evaluate to plain `unknown` — `undefined` is already in
 * `unknown`, so the annotation would claim "may be absent" while the
 * checker holds you to nothing at all. Requiring the argument keeps the
 * module's primary vocabulary type saying something checkable.
 */
export type Maybe<T> = T extends undefined ? never : T | undefined

/**
 * The present case of a {@link Maybe} — the value itself, unwrapped.
 *
 * `T` defaults to `unknown` so the case names can be written bare, as a
 * matched pair with {@link Nothing}. Note what the default does and does
 * not buy: a bare `Nothing` is exactly `undefined`, but a bare `Just` is
 * plain `unknown` — "present, type unstated" is a reading for humans, not
 * a constraint the checker enforces (it cannot even exclude `undefined`
 * without knowing `T`). Name the argument when it matters.
 */
export type Just<T = unknown> = T extends undefined ? never : T

/**
 * The absent case of a {@link Maybe} — always `undefined` at runtime.
 *
 * `T` defaults to `unknown` so `Nothing` can be written bare in an
 * annotation, where it evaluates to exactly `undefined`: the phantom `T`
 * only exists to relate a `Nothing` to the `Maybe` it came from, and a
 * position that doesn't need that relation should not have to invent an
 * argument for it.
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
 * Wraps a value from a null-convention API as a {@link Maybe}, folding both
 * `null` and `undefined` to `Nothing`. The encoding itself knows only one
 * absence — `Nothing` *is* `undefined` (see
 * docs/adr/0001-unboxed-maybe-and-result.md) — so to {@link maybe} a `null`
 * is a value and becomes a `Just`: a trap for the boundary this module
 * exists to serve, since half the platform signals absence with `null`
 * (`querySelector`, `RegExp.prototype.exec`, a JSON field). This is the
 * boundary helper for those APIs. The `null` is folded away rather than
 * carried — the return type is `Maybe<NonNullable<T>>`, so downstream code
 * never sees a null again and the one-absence encoding stays clean.
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
 * Curryable: supply `value` to apply now, or omit it for a Mapper. The two
 * shapes are told apart by arity, never by inspecting the value —
 * `orElse(0, nothing())` passes `undefined` as a real argument and applies,
 * because `Nothing` *is* `undefined` and a value test could not tell an
 * absent Maybe from a missing argument (see docs/adr/0003-currying.md).
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
 * through the same `NotAPromise` guard (a type-only import, keeping the
 * maybe/result boundary free of a runtime cycle). Nothing in this module
 * otherwise asserts that a value resolves synchronously, so an `async`
 * callback would type-check silently and mint a `Maybe<Promise<U>>`: a
 * `Just` that is an unresolved `Promise`, present whatever it eventually
 * settles to. Resolve with `promise/resultify` or `call/resultify` first,
 * then compose with `.then()`.
 *
 * Curryable: supply `value` to apply now, or omit it for a Mapper — decided
 * by arity, never by inspecting the value, which matters here more than
 * anywhere: `map(fn, nothing())` passes `undefined` as a real argument and
 * must apply, not hand back the Mapper (see docs/adr/0003-currying.md).
 *
 * The applied form's `value` is spelled `T | undefined` rather than
 * `Maybe<T>` — the same type for any admissible `T`, but a spelling the
 * compiler can infer `T` from, where inference into `Maybe<T>`'s
 * conditional collapses on an argument that is statically `Nothing`. It is
 * the spelling {@link maybe} itself uses at the boundary, for the same
 * reason. The same holds for every applied form in this module.
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
