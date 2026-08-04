import { describe, expectTypeOf, it } from 'vitest'
import type { Primitive, PrimitiveValueObject } from './index.js'
import type { Branded } from '../brand/index.js'
import type { Result } from '../result/index.js'

/**
 * Pins `/value-object`'s type-only exports — invisible at runtime, so
 * untouched by `test/api-surface/value-object.test.ts`. Referencing each by
 * name means a removal or rename fails typecheck instead of silently
 * dropping from the public surface. See that file's docblock for the full
 * rationale.
 */
type Email = Branded<string, 'Email'>
declare const factory: PrimitiveValueObject<Email, string, Error>

describe('/value-object type exports', () => {
  it('Primitive is the union of primitive types a value object can brand', () => {
    expectTypeOf<Primitive>().toEqualTypeOf<string | number | boolean | null>()
  })

  it('PrimitiveValueObject<T, P, E> is callable to construct T and carries a Result-returning from', () => {
    expectTypeOf(factory).toBeCallableWith('a@b.com')
    expectTypeOf(factory('a@b.com')).toEqualTypeOf<Email>()
    expectTypeOf(factory.from).toEqualTypeOf<
      (value: string) => Result<Email, Error>
    >()
  })
})
