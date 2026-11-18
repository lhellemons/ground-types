import { describe, expectTypeOf, it } from 'vitest'
import type { BestEffort, NotABestEffort } from './index.js'

/**
 * Pins `/best-effort`'s type-only exports — invisible at runtime, so
 * untouched by `test/api-surface/best-effort.test.ts`. Referencing each by
 * name means a removal or rename fails typecheck instead of silently
 * dropping from the public surface. See that file's docblock for the full
 * rationale.
 */
describe('/best-effort type exports', () => {
  it('BestEffort<T, D> has a readonly value and a readonly list of diagnostics', () => {
    expectTypeOf<BestEffort<number, string>>().toEqualTypeOf<{
      readonly value: number
      readonly diagnostics: readonly string[]
    }>()
  })

  it('NotABestEffort<U> is unknown for a value type that is not a BestEffort', () => {
    expectTypeOf<NotABestEffort<number>>().toEqualTypeOf<unknown>()
  })
})
