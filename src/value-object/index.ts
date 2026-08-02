import { tryCatch } from '../result/index.js'
import type { Result } from '../result/index.js'
import type { Branded } from '../brand/index.js'

export type Primitive = string | number | boolean | null

export type PrimitiveValueObject<
  T extends Branded<P, unknown>,
  P extends Primitive = string,
> = ((value: P) => T) & {
  from: (value: P) => Result<T, Error>
}

export function definePrimitiveValueObject<
  P extends Primitive,
  T extends Branded<P, unknown>,
>(construct: (value: P) => T): PrimitiveValueObject<T, P> {
  return Object.assign(construct, { from: tryCatch(construct) })
}
