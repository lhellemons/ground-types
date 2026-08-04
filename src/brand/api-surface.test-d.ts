import { describe, expectTypeOf, it } from 'vitest'
import type { Brand, Branded } from './index.js'

/**
 * Pins `/brand`'s type-only exports — invisible at runtime, so untouched by
 * `test/api-surface/brand.test.ts`. Referencing each by name means a
 * removal or rename fails typecheck instead of silently dropping from the
 * public surface. See that file's docblock for the full rationale.
 *
 * The brand key is a module-private `unique symbol` (see `src/brand/index.ts`),
 * so `Brand<B>`'s exact shape cannot be reconstructed from outside the
 * module for a `toEqualTypeOf` comparison — asserting assignability instead
 * pins that the name still exists and still means "carries this brand".
 */
type UserId = Branded<string, 'UserId'>
declare const id: UserId

describe('/brand type exports', () => {
  it('Branded<T, B> is assignable to T', () => {
    expectTypeOf(id).toExtend<string>()
  })

  it('Branded<T, B> is assignable to Brand<B> — the intersection it is built from', () => {
    function acceptsBrand<B>(_value: Brand<B>): void {}
    acceptsBrand<'UserId'>(id)
  })
})
