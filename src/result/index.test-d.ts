import { describe, expectTypeOf, it } from 'vitest'
import { andThen, failure, map, success } from './index.js'
import type { NotAResult, Result } from './index.js'

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

  it('rejects a callback returning an Error as a value, with a message distinct from the Result rejection', () => {
    // A `Success` carrying an `Error` is unrepresentable (ADR-0001): `T
    // extends Error` collapses `Success<T, E>` to `never`. The callback
    // below returns no `Result` at all, so the fix cannot be `andThen`.
    // @ts-expect-error - a Success can never be an Error
    map((n: number) => new Invalid('as a value'))
  })
})

describe('NotAResult', () => {
  it('names andThen when the return type has a Failure arm', () => {
    // `@ts-expect-error` alone can't tell these two messages apart — both
    // shapes are rejected either way, so a wrong-but-still-a-string message
    // would leave `@ts-expect-error` satisfied. Pin the literal text instead.
    expectTypeOf<
      NotAResult<Result<number, Invalid>>
    >().toEqualTypeOf<'This callback returns a Result — use andThen, not map'>()
  })

  it('names the Success/Error exclusion when the return type IS an Error subclass', () => {
    expectTypeOf<
      NotAResult<Invalid>
    >().toEqualTypeOf<'A Success can never be an Error — see docs/adr/0001-unboxed-maybe-and-result.md'>()
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

describe('andThen with a callback that returns a raw Error', () => {
  it('keeps the Failure arm when the callback skips the failure() constructor', () => {
    // `new Invalid(...)` and `failure(new Invalid(...))` are the same value at
    // runtime — both are identity casts, and discrimination is
    // `instanceof Error`. So the error type must survive either spelling.
    const raw = andThen((n: number) =>
      n > 0 ? success(n) : new Invalid('not positive'),
    )(input)

    expectTypeOf(raw).toEqualTypeOf<Result<number, RangeError | Invalid>>()
  })
})
