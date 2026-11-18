import { curry } from '../fn/index.js'
import type { CurryableMapper } from '../fn/index.js'
import { failure, isFailure } from '../result/index.js'
import type { NotPossiblyAnError, Result } from '../result/index.js'

/**
 * A value usable as it stands, plus the diagnostics gathered while it was
 * built, in the order they were gathered. `D` is any value. The type is
 * structural: a plain object literal with these members is a `BestEffort`.
 * In a box the functions of this module return, the box and its list are
 * frozen; the value and each diagnostic are not.
 */
export type BestEffort<T, D> = {
  readonly value: T
  readonly diagnostics: readonly D[]
}

/**
 * Rejects a value type with a {@link BestEffort} among its top-level union
 * arms: an arm assignable to `BestEffort<unknown, unknown>`, so one with a
 * public required `value` and a public required `diagnostics` that
 * `readonly unknown[]` accepts. A box inside an array, a tuple, an object
 * property or a `Promise` is not reached. Resolves to a message that names
 * `andThen` as the fix.
 */
export type NotABestEffort<U> = [
  Extract<U, BestEffort<unknown, unknown>>,
] extends [never]
  ? unknown
  : 'This value is a BestEffort — use andThen, not map, and toResult only on the inner value'

/**
 * The constructor: a value with the diagnostics already known, none by
 * default. `D` defaults to `never`. Returns a frozen box over a frozen
 * copy of `diagnostics`.
 */
export function bestEffort<T, D = never>(
  value: T,
  diagnostics: readonly D[] = [],
): BestEffort<T, D> {
  return Object.freeze({ value, diagnostics: Object.freeze([...diagnostics]) })
}

/**
 * Appends `diagnostics` after the ones already held; the value is
 * unchanged. Curryable by arity, as `/result`'s combinators are; the
 * unapplied form binds `T` and the box's `D` at application.
 */
export function note<D, T, D2>(
  diagnostics: readonly D[],
  value: BestEffort<T, D2>,
): BestEffort<T, D | D2>
export function note<D>(
  diagnostics: readonly D[],
): <T, D2>(value: BestEffort<T, D2>) => BestEffort<T, D | D2>
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

/**
 * Transforms the value; the diagnostics ride along unchanged. `fn` must
 * not return a `BestEffort` (see {@link NotABestEffort}); {@link andThen}
 * chains a second best-effort step. Curryable; the unapplied form binds
 * `T` and `D` at application.
 */
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
    (value: BestEffort<T, D>) =>
      bestEffort(fn(value.value), [...value.diagnostics]),
    ...value,
  )
}

/**
 * Chains a second best-effort step: the diagnostics of the first come
 * before those of the second, and the diagnostic types union. Curryable;
 * the unapplied form binds `T` and `D` at application.
 */
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

/**
 * Fans a list of best-effort parts in: every value, in part order, as an
 * unfrozen array, with every part's diagnostics in part order. All parts
 * share one `T` and one `D`.
 */
export function gather<T, D>(
  parts: readonly BestEffort<T, D>[],
): BestEffort<readonly T[], D> {
  return bestEffort(
    parts.map((part) => part.value),
    parts.flatMap((part) => [...part.diagnostics]),
  )
}

/**
 * The bridge in: a Success is itself with no diagnostics; a Failure is
 * `fallback` with the error itself as its one diagnostic. Curryable by
 * arity; the unapplied form binds `T` at the call and `E` at application.
 * The curried form puts the same `fallback` in every box it makes.
 * {@link recoverWith} records something made from the error instead.
 */
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

/**
 * The bridge in with a diagnostic of the caller's own shape: a Success is
 * itself with no diagnostics; a Failure is `fallback` with
 * `diagnose(error)` as its one diagnostic. A throw from `diagnose`
 * propagates. Curryable by arity; the unapplied form binds `T`, `E` and
 * `D` at the call. The curried form puts the same `fallback` in every box it
 * makes.
 */
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

/**
 * The bridge out: a Success of the value when no diagnostic exists, else a
 * Failure of `toError(diagnostics)`, handed the whole list in order. A
 * throw from `toError` propagates. `T` must pass `success`'s
 * {@link NotPossiblyAnError} and {@link NotABestEffort} together; a `T` of
 * `any` is refused. Curryable; the unapplied form binds `D` and `E` at the
 * call and `T` at application.
 */
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
