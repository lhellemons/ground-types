import { tryCatch } from '../result/index.js'
import type { Result } from '../result/index.js'
import type { Branded } from '../brand/index.js'
import type { Mapper } from '../fn/index.js'

/** The primitive types a {@link PrimitiveValueObject} can brand. */
export type Primitive = string | number | boolean | null

/**
 * The shape produced by {@link definePrimitiveValueObject}: callable
 * directly to construct `T` (throwing on invalid input), and carrying a
 * `.from` that returns a `Result` instead of throwing. `E` defaults to
 * `Error` — the type `tryCatch`'s handler-less overload produces — but a
 * factory built with its own `errorHandler` narrows `.from` to that
 * handler's concrete Failure type, so a caller can branch on it (see
 * CONTEXT.md's Failure entry).
 */
export type PrimitiveValueObject<
  T extends Branded<P, unknown>,
  P extends Primitive = string,
  E extends Error = Error,
> = ((value: P) => T) & {
  from: (value: P) => Result<T, E>
}

/**
 * Builds a {@link PrimitiveValueObject} factory from a validating
 * constructor. `construct` should throw to reject invalid input; the
 * returned factory is callable directly for the throwing form, and exposes
 * `.from` — built from `construct` via `tryCatch` — for the `Result` form.
 *
 * Type parameters are ordered `T, P, E`, matching {@link
 * PrimitiveValueObject} exactly. `P` defaults to `string` and `E` to
 * `Error`, so the common case is a single explicit type argument:
 * `definePrimitiveValueObject<Email>(...)`.
 *
 * `.from`'s Failure type is `Error` by default, matching `tryCatch`'s own
 * handler-less overload. Pass `errorHandler` — forwarded to `tryCatch`
 * verbatim — to translate a thrown value into a concrete `Error` subclass
 * instead. For domain errors, use
 * `definePrimitiveValueObject(construct, catchOnly(InvalidValue))`;
 * the error type is inferred from the listed classes when type arguments
 * are omitted. Without a handler, the Failure type is `Error`.
 */
export function definePrimitiveValueObject<
  T extends Branded<P, unknown>,
  P extends Primitive = string,
>(construct: (value: P) => T): PrimitiveValueObject<T, P, Error>
export function definePrimitiveValueObject<
  T extends Branded<P, unknown>,
  P extends Primitive = string,
  E extends Error = Error,
>(
  construct: (value: P) => T,
  errorHandler: Mapper<unknown, Result<T, E>>,
): PrimitiveValueObject<T, P, E>
export function definePrimitiveValueObject<
  T extends Branded<P, unknown>,
  P extends Primitive = string,
  E extends Error = Error,
>(
  construct: (value: P) => T,
  errorHandler?: Mapper<unknown, Result<T, E>>,
): PrimitiveValueObject<T, P, E> {
  const factory = (value: P) => construct(value)
  const from = errorHandler
    ? tryCatch(construct, errorHandler)
    : (tryCatch(construct) as (value: P) => Result<T, E>)
  return Object.assign(factory, { from })
}
