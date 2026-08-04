import { describe, expectTypeOf, it } from 'vitest'
import { fallback, map, maybe, nothing, orElse } from './index.js'
import type { Maybe } from './index.js'

declare const input: Maybe<number>

describe('map, curried and applied', () => {
  it('returns a Mapper when the value is omitted', () => {
    const double = map((n: number) => n * 2)

    expectTypeOf(double).toEqualTypeOf<
      (value: Maybe<number>) => Maybe<number>
    >()
  })

  it('infers the mapped Maybe when the value is supplied', () => {
    const labelled = map((n: number) => `n-${n}`, input)

    expectTypeOf(labelled).toEqualTypeOf<Maybe<string>>()
  })

  it('infers through an argument that is statically Nothing', () => {
    // `Nothing<number>` erases to plain `undefined`, which is exactly the
    // shape that collapses inference into `Maybe<T>`'s conditional — the
    // reason the applied form's `value` is spelled `T | undefined`.
    const labelled = map((n: number) => `n-${n}`, nothing<number>())

    expectTypeOf(labelled).toEqualTypeOf<Maybe<string>>()
  })
})

describe('orElse and fallback, applied', () => {
  it('infer the unwrapped Just when the value is supplied', () => {
    expectTypeOf(orElse(0, input)).toEqualTypeOf<number>()
    expectTypeOf(fallback(() => 0, input)).toEqualTypeOf<number>()
  })
})

declare const found: number | undefined

describe('maybe', () => {
  it('infers the wrapped type from a boundary T | undefined', () => {
    expectTypeOf(maybe(found)).toEqualTypeOf<Maybe<number>>()
  })
})
