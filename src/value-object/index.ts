import { tryCatch } from '../result/index.js'
import type { Result } from '../result/index.js'
import type { Branded } from '../brand/index.js'

/** The primitive types a {@link PrimitiveValueObject} can brand. */
export type Primitive = string | number | boolean | null

/**
 * The shape produced by {@link definePrimitiveValueObject}: callable
 * directly to construct `T` (throwing on invalid input), and carrying a
 * `.from` that returns a `Result` instead of throwing.
 */
export type PrimitiveValueObject<
  T extends Branded<P, unknown>,
  P extends Primitive = string,
> = ((value: P) => T) & {
  from: (value: P) => Result<T, Error>
}

/**
 * Builds a {@link PrimitiveValueObject} factory from a validating
 * constructor. `construct` should throw to reject invalid input; the
 * returned factory is callable directly for the throwing form, and exposes
 * `.from` — built from `construct` via `tryCatch` — for the `Result` form.
 */
export function definePrimitiveValueObject<
  P extends Primitive,
  T extends Branded<P, unknown>,
>(construct: (value: P) => T): PrimitiveValueObject<T, P> {
  const factory = (value: P) => construct(value)
  return Object.assign(factory, { from: tryCatch(construct) })
}
