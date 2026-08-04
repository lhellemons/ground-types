import { describe, expectTypeOf, it } from 'vitest'
import type { Just, Maybe, Nothing } from './index.js'

/**
 * Pins `/maybe`'s type-only exports — invisible at runtime, so untouched by
 * `test/api-surface/maybe.test.ts`. Referencing each by name means a
 * removal or rename fails typecheck instead of silently dropping from the
 * public surface. See that file's docblock for the full rationale.
 */
describe('/maybe type exports', () => {
  it('Maybe<T> is T | undefined, with T excluded from undefined', () => {
    expectTypeOf<Maybe<number>>().toEqualTypeOf<number | undefined>()
  })

  it('Just defaults to unknown', () => {
    expectTypeOf<Just>().toEqualTypeOf<unknown>()
  })

  it('Nothing defaults to exactly undefined', () => {
    expectTypeOf<Nothing>().toEqualTypeOf<undefined>()
  })
})
