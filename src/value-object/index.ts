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
 * PrimitiveValueObject} exactly, rather than the `P, T` this function used
 * to take. `T` — the branded type being defined — is what a caller
 * actually wants to name; `P` almost always defaults to `string` and `E`
 * to `Error`, so with both defaulted and `T` first, the common case is a
 * single explicit type argument, `definePrimitiveValueObject<Email>(...)`,
 * with nothing to get out of order. The reverse would leave `T` unable to
 * default (a real branded type never should) while accepting a lone
 * argument silently as `P` instead — confirmed by trying it: with the old
 * `P, T` order, `definePrimitiveValueObject<Email>(...)` compiles by
 * assigning `Email` to `P`, which is Email's own underlying primitive
 * structurally but not the intent, and `T` is left as `unknown`.
 *
 * `.from`'s Failure type is `Error` by default, matching `tryCatch`'s own
 * handler-less overload. Pass `errorHandler` to translate a thrown value
 * into a concrete `Error` subclass instead; it is forwarded to `tryCatch`
 * verbatim, so `.from` routes through `tryCatch`'s generic-in-`E` overload
 * instead. Name `E` explicitly alongside `T` when doing so: `Result`'s
 * `Success` carries an invariant `E` phantom (docs/adr/0001, 2026-08-04
 * amendment), which keeps TypeScript from reliably inferring `E` from
 * `errorHandler`'s return type alone — confirmed by trying inference-only
 * first and watching it default back to `Error`. This is the same
 * annotation the ADR already asks for when constructing a `Result` directly
 * at a call site typed to a narrower error class.
 *
 * Two overloads, split for the same reason `tryCatch` itself is: naming `E`
 * without supplying an `errorHandler` would otherwise let a thrown value
 * other than `E` reach `.from` uncaught by the type system. Without a
 * handler, `E` cannot be named at all — `.from`'s Failure type is `Error`.
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
