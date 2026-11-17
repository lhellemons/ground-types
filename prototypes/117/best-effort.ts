/* PROTOTYPE #117 — throwaway, not part of the library. The `/best-effort`
   kit as ticket 65 ruled it: a boxed `BestEffort<T, D>` (a value usable as
   it stands plus the diagnostics gathered while building it), a
   constructor, `map`, an `andThen` that keeps diagnostics in order, and a
   bridge each way with `Result`. Functional, value-last and curryable as
   `/result` is. The unapplied `map`, `note` and `andThen` bind `T` and the
   box's `D` at application, as `/result`'s `map(fn)` does; the unapplied
   `toResult(toError)` binds `D` and `E` at the call and `T` at
   application; `recover(fallback)` binds `T` at the call and `E` at
   application; `recoverWith(fallback, diagnose)` binds `T`, `E` and `D` at
   the call. A Box is #89's question.

   Two guard variants of the bridge out are kept side by side so the probes
   can measure them: `toResult` carries `success`'s `NotPossiblyAnError`
   guard on `T`, `toResultUnguarded` bypasses it with a cast as `orElse`
   and `fromMaybe` do. */
import { curry } from '../../src/fn/index.js'
import type { CurryableMapper } from '../../src/fn/index.js'
import { failure, isFailure } from '../../src/result/index.js'
import type { NotPossiblyAnError, Result } from '../../src/result/index.js'

/** A value usable as it stands, plus the diagnostics gathered while it was
 * built, in the order they were gathered. `D` is any value. The type is
 * structural. In a box the kit's functions return, the box and its list
 * are frozen; the value and each diagnostic are not. */
export type BestEffort<T, D> = {
  readonly value: T
  readonly diagnostics: readonly D[]
}

/** Rejects a value type with a `BestEffort` among its top-level union
 * arms. Structural, so any object with a `value` and an array
 * `diagnostics` is refused; a box inside an array, a tuple, an object
 * property or a Promise is not reached. Names the fix. */
export type NotABestEffort<U> = [
  Extract<U, BestEffort<unknown, unknown>>,
] extends [never]
  ? unknown
  : 'This value is a BestEffort — use andThen, not map, and toResult only on the inner value'

/** The constructor: a value with the diagnostics already known, none by
 * default. `D` defaults to `never`. Returns a frozen object over a frozen
 * copy of `diagnostics`. */
export function bestEffort<T, D = never>(
  value: T,
  diagnostics: readonly D[] = [],
): BestEffort<T, D> {
  return Object.freeze({ value, diagnostics: Object.freeze([...diagnostics]) })
}

/** Appends `diagnostics` after the ones already held; the value is
 * unchanged. Curryable by arity, as `/result`'s combinators are; the
 * unapplied form binds `T` and the box's own `D2` at application. */
export function note<D, T, D2>(
  diagnostics: readonly D[],
  value: BestEffort<T, D2>,
): BestEffort<T, D | D2>
export function note<D>(
  diagnostics: readonly D[],
): <T, D2 = never>(value: BestEffort<T, D2>) => BestEffort<T, D | D2>
export function note<D, T, D2>(
  diagnostics: readonly D[],
  ...value: [] | [BestEffort<T, D2>]
): CurryableMapper<BestEffort<T, D2>, BestEffort<T, D | D2>> {
  return curry(
    (value: BestEffort<T, D2>) =>
      bestEffort<T, D | D2>(value.value, [
        ...value.diagnostics,
        ...diagnostics,
      ]),
    ...value,
  )
}

/** Transforms the value; the diagnostics ride along unchanged. `fn` must
 * not return a `BestEffort` (see {@link NotABestEffort}); {@link andThen}
 * chains a second best-effort step. Curryable; the unapplied form binds
 * `T` and `D` at application. */
export function map<A, U extends NotABestEffort<U>, T extends A, D>(
  fn: (value: A) => U,
  value: BestEffort<T, D>,
): BestEffort<U, D>
export function map<A, U extends NotABestEffort<U>>(
  fn: (value: A) => U,
): <T extends A, D>(value: BestEffort<T, D>) => BestEffort<U, D>
export function map<A, U extends NotABestEffort<U>, T extends A, D>(
  fn: (value: A) => U,
  ...value: [] | [BestEffort<T, D>]
): CurryableMapper<BestEffort<T, D>, BestEffort<U, D>> {
  return curry(
    (value: BestEffort<T, D>) => bestEffort(fn(value.value), value.diagnostics),
    ...value,
  )
}

/** Chains a second best-effort step: the diagnostics of the first come
 * before those of the second, and the diagnostic types union. Curryable;
 * the unapplied form binds `T` and `D` at application. */
export function andThen<A, U, D2, T extends A, D>(
  fn: (value: A) => BestEffort<U, D2>,
  value: BestEffort<T, D>,
): BestEffort<U, D | D2>
export function andThen<A, U, D2>(
  fn: (value: A) => BestEffort<U, D2>,
): <T extends A, D>(value: BestEffort<T, D>) => BestEffort<U, D | D2>
export function andThen<A, U, D2, T extends A, D>(
  fn: (value: A) => BestEffort<U, D2>,
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

/** Fans a list of best-effort parts in: every value, in part order, with
 * every part's diagnostics in part order. */
export function gather<T, D>(
  parts: readonly BestEffort<T, D>[],
): BestEffort<readonly T[], D> {
  return bestEffort(
    parts.map((part) => part.value),
    parts.flatMap((part) => part.diagnostics),
  )
}

/** The bridge in: a Success is itself with no diagnostics; a Failure is
 * `fallback` with the error itself as its one diagnostic. Curryable by
 * arity, as `orElse` is; `fallback` is unguarded. {@link recoverWith}
 * records something made from the error instead. */
export function recover<T, E extends Error>(
  fallback: T,
  result: Result<T, E>,
): BestEffort<T, E>
export function recover<T>(
  fallback: T,
): <E extends Error>(result: Result<T, E>) => BestEffort<T, E>
export function recover<T, E extends Error>(
  fallback: T,
  ...result: [] | [Result<T, E>]
): CurryableMapper<Result<T, E>, BestEffort<T, E>> {
  return curry(
    (result: Result<T, E>): BestEffort<T, E> =>
      isFailure(result) ? bestEffort(fallback, [result]) : bestEffort(result),
    ...result,
  )
}

/** The bridge in with a diagnostic of the consumer's own shape: a Success
 * is itself with no diagnostics; a Failure is `fallback` with
 * `diagnose(error)` as its one diagnostic. A throw from `diagnose`
 * propagates. Curryable by arity. */
export function recoverWith<T, E extends Error, D>(
  fallback: T,
  diagnose: (error: E) => D,
  result: Result<T, E>,
): BestEffort<T, D>
export function recoverWith<T, E extends Error, D>(
  fallback: T,
  diagnose: (error: E) => D,
): (result: Result<T, E>) => BestEffort<T, D>
export function recoverWith<T, E extends Error, D>(
  fallback: T,
  diagnose: (error: E) => D,
  ...result: [] | [Result<T, E>]
): CurryableMapper<Result<T, E>, BestEffort<T, D>> {
  return curry(
    (result: Result<T, E>): BestEffort<T, D> =>
      isFailure(result)
        ? bestEffort(fallback, [diagnose(result)])
        : bestEffort(result),
    ...result,
  )
}

/** The bridge out, guarded: a Success of the value when no diagnostic
 * exists, else a Failure of `toError(diagnostics)`, handed the whole list
 * in order. A throw from `toError` propagates. `T` must pass `success`'s
 * guard and must not itself be a `BestEffort`. Curryable; the unapplied form binds `T` at application. */
export function toResult<
  T extends NotPossiblyAnError<T> & NotABestEffort<T>,
  D,
  E extends Error,
>(
  toError: (diagnostics: readonly D[]) => E,
  value: BestEffort<T, D>,
): Result<T, E>
export function toResult<D, E extends Error>(
  toError: (diagnostics: readonly D[]) => E,
): <T extends NotPossiblyAnError<T> & NotABestEffort<T>>(
  value: BestEffort<T, D>,
) => Result<T, E>
export function toResult<T, D, E extends Error>(
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
