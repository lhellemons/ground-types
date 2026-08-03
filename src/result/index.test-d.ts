import { describe, expectTypeOf, it } from 'vitest'
import { andThen, failure, map, success } from './index.js'
import type { Result } from './index.js'

/** A domain Failure type distinct from the one the input can already carry. */
class Invalid extends Error {
  readonly kind = 'Invalid' as const
}

declare const input: Result<number, RangeError>

describe('andThen', () => {
  it('infers the Success type through a callback that can also fail', () => {
    const chained = andThen((n: number) =>
      n > 0 ? success(n * 2) : failure(new Invalid('not positive')),
    )(input)

    expectTypeOf(chained).toEqualTypeOf<Result<number, RangeError | Invalid>>()
  })
})

describe('map', () => {
  it('rejects a callback that returns a Result, which andThen exists to handle', () => {
    // Running a `Result`-returning callback through `map` is the documented
    // trap (ADR-0001): it cannot produce a `Result<Result<T>>`, so today it
    // silently degrades to `any` and erases all downstream checking.
    // @ts-expect-error - use andThen for a second fallible step
    map((n: number) => (n > 0 ? success(n * 2) : failure(new Invalid('x'))))
  })
})

describe('andThen with a callback that does not itself fail', () => {
  it('keeps the Success type when the callback returns a plain value', () => {
    // Previously valid consumer code: a callback that cannot fail still has
    // to type-check, and must not silently become a Failure-only Result.
    const doubled = andThen((n: number) => n * 2)(input)

    expectTypeOf(doubled).toEqualTypeOf<Result<number, RangeError>>()
  })
})
