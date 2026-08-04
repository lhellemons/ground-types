import { describe, expectTypeOf, it } from 'vitest'
import { andThen, failure, map, success, tryCatch } from './index.js'
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
    map((_n: number) => new Invalid('as a value'))
  })

  it('rejects a callback that returns a Promise, which resolves outside map', () => {
    // map runs synchronously; an async callback produces a Success that is
    // itself an unresolved Promise, which isSuccess reports as true.
    // @ts-expect-error - resolve first (promise/resultify or call/resultify), then compose with .then()
    map(async (n: number) => n * 2)
  })

  it('rejects a callback that returns a non-native thenable', () => {
    // A custom deferred or older async library may resolve via a `then`
    // method without being a real `Promise` instance. The same unresolved
    // Success trap applies, so the guard must catch this by shape, not by
    // `instanceof`/exact-type match.
    const makeThenable = (
      n: number,
    ): { then(onfulfilled: (v: number) => void): void } => ({
      then: (onfulfilled) => onfulfilled(n),
    })
    // @ts-expect-error - resolve first (promise/resultify or call/resultify), then compose with .then()
    map(makeThenable)
  })

  it('rejects a callback whose return type is a sync/async union', () => {
    // A callback that sometimes returns a cached value and sometimes fetches
    // — `(n: number) => number | Promise<number>` — is not itself assignable
    // to `Promise<unknown>` as a whole, so a check that only matches the
    // whole union misses the Promise arm entirely.
    const maybeAsync = (n: number): number | Promise<number> =>
      n > 0 ? n : Promise.resolve(n)
    // @ts-expect-error - resolve first (promise/resultify or call/resultify), then compose with .then()
    map(maybeAsync)
  })
})

describe('tryCatch', () => {
  it('rejects an async function at compile time — tryCatch runs synchronously', () => {
    // An async fn's own throw happens after tryCatch's try/catch has
    // already exited, so it never lands in the catch block: the returned
    // promise rejects unhandled while isSuccess reports true on it.
    // @ts-expect-error - resolve first (promise/resultify or call/resultify), then compose with .then()
    tryCatch(async () => 5)
  })

  it('rejects a fn whose return type is a sync/async union', () => {
    const maybeAsync = (n: number): number | Promise<number> =>
      n > 0 ? n : Promise.resolve(n)
    // @ts-expect-error - resolve first (promise/resultify or call/resultify), then compose with .then()
    tryCatch(maybeAsync)
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

describe('andThen with a callback that returns a Promise', () => {
  it('rejects at compile time — andThen runs synchronously', () => {
    // A Promise carries no Error arm, so it falls through the same fallback
    // path a plain, cannot-fail value takes, producing a Success that is
    // itself an unresolved Promise. isSuccess reports that as true.
    // @ts-expect-error - resolve first (promise/resultify or call/resultify), then compose with .then()
    andThen(async (n: number) => success(n))(input)
  })

  it('rejects a callback whose return type is a sync/async union', () => {
    const maybeAsync = (
      n: number,
    ): Result<number, RangeError> | Promise<Result<number, RangeError>> =>
      n > 0 ? success(n) : Promise.resolve(success(n))
    // @ts-expect-error - resolve first (promise/resultify or call/resultify), then compose with .then()
    andThen(maybeAsync)(input)
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
