import { describe, expectTypeOf, it } from 'vitest'
import type { CurryableMapper, Fn, Mapper } from './index.js'

/**
 * Pins `/fn`'s type-only exports — invisible at runtime, so untouched by
 * `test/api-surface/fn.test.ts`. Referencing each by name means a removal
 * or rename fails typecheck instead of silently dropping from the public
 * surface. See that file's docblock for the full rationale.
 */
describe('/fn type exports', () => {
  it('Fn<Return, Args> is a function of a concrete argument tuple', () => {
    expectTypeOf<Fn<string, [number]>>().toEqualTypeOf<
      (...args: [number]) => string
    >()
  })

  it('bare Fn defaults to an unknown-argument function returning unknown', () => {
    expectTypeOf<Fn>().toEqualTypeOf<(...args: unknown[]) => unknown>()
  })

  it('Mapper<T, U> is the unary special case of Fn', () => {
    expectTypeOf<Mapper<number, string>>().toEqualTypeOf<
      (t: number) => string
    >()
  })

  it('CurryableMapper<T, U> is Mapper<T, U> or the already-applied U', () => {
    expectTypeOf<CurryableMapper<number, string>>().toEqualTypeOf<
      ((t: number) => string) | string
    >()
  })
})
