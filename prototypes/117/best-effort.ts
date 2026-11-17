/* PROTOTYPE #117 — throwaway, not part of the library. The `/best-effort`
   kit as ticket 65 ruled it: a boxed `BestEffort<T, D>` (a value usable as
   it stands plus the diagnostics gathered while building it), a
   constructor, `map`, an `andThen` that keeps diagnostics in order, and a
   bridge each way with `Result`. Functional, value-last and curryable like
   `/result`; a Box is #89's question.

   Two guard variants are kept side by side so the probes can measure them:
   `toResult` carries `success`'s `NotPossiblyAnError` guard on `T`,
   `toResultUnguarded` bypasses it with a cast as `orElse` and `fromMaybe`
   do. The constructor, `map` and `recover`'s fallback carry no guard: the
   box keeps the value and the list apart, so an Error-typed value is
   unambiguous until it leaves through `toResult`. */
import { curry } from '../../src/fn/index.js'
import type { CurryableMapper } from '../../src/fn/index.js'
import { failure, isFailure } from '../../src/result/index.js'
import type { NotPossiblyAnError, Result } from '../../src/result/index.js'

/** A value usable as it stands, plus the diagnostics gathered while it was
 * built, in the order they were gathered. `D` is any value. */
export type BestEffort<T, D> = {
  readonly value: T
  readonly diagnostics: readonly D[]
}

/** The constructor: a value with the diagnostics already known, none by
 * default. `D` defaults to `never`, so a clean value flows into any
 * `BestEffort<T, D>`. */
export function bestEffort<T, D = never>(
  value: T,
  diagnostics: readonly D[] = [],
): BestEffort<T, D> {
  return Object.freeze({ value, diagnostics: Object.freeze([...diagnostics]) })
}

/** Appends diagnostics to a BestEffort without touching its value: the
 * Writer's `tell`. The consumer's readers push a diagnostic and go on. */
export function note<T, D>(
  diagnostics: readonly D[],
  value: BestEffort<T, D>,
): BestEffort<T, D>
export function note<T, D>(
  diagnostics: readonly D[],
): (value: BestEffort<T, D>) => BestEffort<T, D>
export function note<T, D>(
  diagnostics: readonly D[],
  ...value: [] | [BestEffort<T, D>]
): CurryableMapper<BestEffort<T, D>, BestEffort<T, D>> {
  return curry(
    (value: BestEffort<T, D>) =>
      bestEffort(value.value, [...value.diagnostics, ...diagnostics]),
    ...value,
  )
}

/** Transforms the value; the diagnostics ride along unchanged. */
export function map<T, U, D>(
  fn: (value: T) => U,
  value: BestEffort<T, D>,
): BestEffort<U, D>
export function map<T, U, D>(
  fn: (value: T) => U,
): (value: BestEffort<T, D>) => BestEffort<U, D>
export function map<T, U, D>(
  fn: (value: T) => U,
  ...value: [] | [BestEffort<T, D>]
): CurryableMapper<BestEffort<T, D>, BestEffort<U, D>> {
  return curry(
    (value: BestEffort<T, D>) => bestEffort(fn(value.value), value.diagnostics),
    ...value,
  )
}

/** Chains a second best-effort step: the diagnostics of the first come
 * before those of the second. The diagnostic types union. */
export function andThen<T, U, D, D2>(
  fn: (value: T) => BestEffort<U, D2>,
  value: BestEffort<T, D>,
): BestEffort<U, D | D2>
export function andThen<T, U, D, D2>(
  fn: (value: T) => BestEffort<U, D2>,
): (value: BestEffort<T, D>) => BestEffort<U, D | D2>
export function andThen<T, U, D, D2>(
  fn: (value: T) => BestEffort<U, D2>,
  ...value: [] | [BestEffort<T, D>]
): CurryableMapper<BestEffort<T, D>, BestEffort<U, D | D2>> {
  return curry(
    (value: BestEffort<T, D>) => {
      const next = fn(value.value)
      return bestEffort<U, D | D2>(next.value, [
        ...value.diagnostics,
        ...next.diagnostics,
      ])
    },
    ...value,
  )
}

/** Fans a list of best-effort parts in: every value, with every part's
 * diagnostics in part order. The Writer's applicative over a list; a
 * question for #118, measured here because the consumer's drop-a-piece path
 * needs it. */
export function gather<T, D>(
  parts: readonly BestEffort<T, D>[],
): BestEffort<readonly T[], D> {
  return bestEffort(
    parts.map((part) => part.value),
    parts.flatMap((part) => part.diagnostics),
  )
}

/** The bridge in: a Success is itself with no diagnostics; a Failure is
 * `fallback` with the error recorded as the one diagnostic, as `diagnose`
 * reads it (the error itself when `diagnose` is absent). `T` is unresolved
 * here, as in `orElse`, so no guard judges `fallback`. */
export function recover<T, E extends Error>(
  result: Result<T, E>,
  fallback: T,
): BestEffort<T, E>
export function recover<T, E extends Error, D>(
  result: Result<T, E>,
  fallback: T,
  diagnose: (error: E) => D,
): BestEffort<T, D>
export function recover<T, E extends Error, D>(
  result: Result<T, E>,
  fallback: T,
  diagnose?: (error: E) => D,
): BestEffort<T, D | E> {
  if (isFailure(result))
    return bestEffort<T, D | E>(fallback, [
      diagnose === undefined ? result : diagnose(result),
    ])
  return bestEffort(result)
}

/** The bridge out, guarded: a Success of the value when no diagnostic
 * exists, else a Failure of `toError(diagnostics)`. `T` must pass
 * `success`'s guard, since the Success arm is unboxed. */
export function toResult<T extends NotPossiblyAnError<T>, D, E extends Error>(
  toError: (diagnostics: readonly D[]) => E,
  value: BestEffort<T, D>,
): Result<T, E>
export function toResult<T extends NotPossiblyAnError<T>, D, E extends Error>(
  toError: (diagnostics: readonly D[]) => E,
): (value: BestEffort<T, D>) => Result<T, E>
export function toResult<T extends NotPossiblyAnError<T>, D, E extends Error>(
  toError: (diagnostics: readonly D[]) => E,
  ...value: [] | [BestEffort<T, D>]
): CurryableMapper<BestEffort<T, D>, Result<T, E>> {
  return curry(
    (value: BestEffort<T, D>): Result<T, E> =>
      value.diagnostics.length > 0
        ? failure(toError(value.diagnostics))
        : (value.value as Result<T, E>),
    ...value,
  )
}

/** The bridge out, unguarded: the same at runtime, with `T` admitted as
 * `orElse` and `fromMaybe` admit theirs, through a cast. */
export function toResultUnguarded<T, D, E extends Error>(
  toError: (diagnostics: readonly D[]) => E,
  value: BestEffort<T, D>,
): Result<T, E> {
  return value.diagnostics.length > 0
    ? failure(toError(value.diagnostics))
    : (value.value as Result<T, E>)
}
