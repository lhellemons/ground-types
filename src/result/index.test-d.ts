import { describe, expectTypeOf, it } from 'vitest'
import { andThen, failure, map, mapError, success, tryCatch } from './index.js'
import type { Failure, NotAResult, Result, Success } from './index.js'

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

  it('infers identically when the value is supplied in the same call', () => {
    // The applied overload must not cost the inference quality the unapplied
    // form has: T and E still bind from the value, the callback's own
    // Failure arm still joins the error union.
    const chained = andThen(
      (n: number) =>
        n > 0 ? success(n * 2) : failure(new Invalid('not positive')),
      input,
    )

    expectTypeOf(chained).toEqualTypeOf<Result<number, RangeError | Invalid>>()
  })
})

describe('map, curried and applied', () => {
  it('stays generic when the value is omitted: T and E bind at application, not at map(fn)', () => {
    // One unapplied map(double) must slot into chains over any error type.
    const double = map((n: number) => n * 2)

    expectTypeOf(double(input)).toEqualTypeOf<Result<number, RangeError>>()
    expectTypeOf(
      double(input as unknown as Result<number, Invalid>),
    ).toEqualTypeOf<Result<number, Invalid>>()
  })

  it('binds T and E from the value when applied in the same call', () => {
    const doubled = map((n: number) => n * 2, input)

    expectTypeOf(doubled).toEqualTypeOf<Result<number, RangeError>>()
  })

  it('applies the same callback guards in the applied form', () => {
    const toResult = (n: number) =>
      n > 0 ? success(n * 2) : failure(new Invalid('x'))
    // @ts-expect-error - use andThen for a second fallible step
    map(toResult, input)
    // @ts-expect-error - resolve first (promise/resultify or call/resultify), then compose with .then()
    map(async (n: number) => n * 2, input)
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

describe('mapError', () => {
  it('translates the error type while the Success type flows through', () => {
    const translated = mapError(
      (error: RangeError) => new Invalid(error.message),
    )(input)

    expectTypeOf(translated).toEqualTypeOf<Result<number, Invalid>>()
  })

  it('infers identically when the value is supplied in the same call', () => {
    const translated = mapError(
      (error: RangeError) => new Invalid(error.message),
      input,
    )

    expectTypeOf(translated).toEqualTypeOf<Result<number, Invalid>>()
  })

  it('stays generic when the value is omitted: T and E bind at application', () => {
    const widen = mapError((error: Error) => new Invalid(error.message))

    expectTypeOf(widen(input)).toEqualTypeOf<Result<number, Invalid>>()
    expectTypeOf(
      widen(input as unknown as Result<string, TypeError>),
    ).toEqualTypeOf<Result<string, Invalid>>()
  })

  it('drops the recovered error type when the callback returns a Success', () => {
    // Recovery through the full-Result handler vocabulary: every Failure
    // was mapped to a Success, so no error type remains.
    const recovered = mapError((error: RangeError) =>
      success(error.message.length),
    )(input)

    expectTypeOf(recovered).toEqualTypeOf<Result<number, never>>()
  })

  it('unions the arms of a translate-or-recover callback', () => {
    const mixed = mapError((error: RangeError) =>
      error.message === 'benign' ? success(0) : new Invalid(error.message),
    )(input)

    expectTypeOf(mixed).toEqualTypeOf<Result<number, Invalid>>()
  })

  it('rejects a callback that returns a Promise — mapError runs synchronously', () => {
    // @ts-expect-error - resolve first (promise/resultify or call/resultify), then compose with .then()
    mapError(async (error: RangeError) => new Invalid(error.message))
  })

  it('rejects an input whose error type the callback cannot handle', () => {
    // @ts-expect-error - the callback narrows to Invalid, the input carries RangeError
    mapError((error: Invalid) => new RangeError(error.message), input)
  })
})

describe('tryCatch', () => {
  it('fixes E = Error when the handler is omitted — all the default can honour', () => {
    const lifted = tryCatch((n: number) => n * 2)

    expectTypeOf(lifted).toEqualTypeOf<(n: number) => Result<number, Error>>()
  })

  it('stays generic in E when a handler is supplied', () => {
    const lifted = tryCatch(
      (n: number) => n * 2,
      () => new Invalid('boom'),
    )

    expectTypeOf(lifted).toEqualTypeOf<(n: number) => Result<number, Invalid>>()
  })

  it('rejects naming E without supplying the handler that would produce it', () => {
    // The unsound corner the overload split closes: under the single
    // signature this compiled, and the default handler's cast passed a
    // thrown TypeError off as Failure<number, Invalid>.
    // @ts-expect-error - no overload takes three type arguments and one value argument
    tryCatch<number, [], Invalid>(() => 5)
  })

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

describe('failure and success constructors', () => {
  it('binds failure’s single explicit type argument to the error', () => {
    // The trap the <E, T> order closes: under <T, E>, failure<Invalid>(e)
    // silently bound the SUCCESS type, yielding Failure<Invalid, Error> —
    // the named error class demoted to plain Error, with no diagnostic.
    const f = failure<Invalid>(new Invalid('x'))

    expectTypeOf(f).toEqualTypeOf<Failure<unknown, Invalid>>()
  })

  it('rejects a non-Error single type argument, where the old order accepted it', () => {
    // @ts-expect-error - the first type parameter is the error now
    failure<number>(new Invalid('x'))
  })

  it('keeps success value-first — the documented, deliberate asymmetry', () => {
    expectTypeOf(success<number>(5)).toEqualTypeOf<Success<number, Error>>()
    expectTypeOf(success<number, Invalid>(5)).toEqualTypeOf<
      Success<number, Invalid>
    >()
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
