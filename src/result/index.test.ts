import { describe, expect, it } from 'vitest'
import {
  andThen,
  assertSuccess,
  failure,
  fallback,
  fromMaybe,
  isFailure,
  isSuccess,
  map,
  mapError,
  orElse,
  result,
  success,
  ThrownError,
  tryCatch,
} from './index.js'
import type { Failure, Result, Success } from './index.js'
import { maybe, nothing } from '../maybe/index.js'

// Tuple-wrapped so the checks don't distribute over union types.
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type Extends<A, B> = [A] extends [B] ? true : false
type Expect<T extends true> = T

class WidgetError extends Error {
  readonly widgetId: string
  constructor(widgetId: string) {
    super(`bad widget "${widgetId}"`)
    this.name = 'WidgetError'
    this.widgetId = widgetId
  }
}

describe('andThen', () => {
  it('chains a success through to the next step', () => {
    const double = andThen((n: number) => success(n * 2))
    expect(double(success(21))).toBe(42)
  })

  it('short-circuits on an existing failure without calling the next step', () => {
    let called = false
    const step = andThen((n: number) => {
      called = true
      return success(n * 2)
    })
    const input = failure<number>(new Error('already broken'))
    const result = step(input)
    expect(called).toBe(false)
    expect(result).toBe(input)
  })

  it('propagates a failure returned by the next step itself', () => {
    const step = andThen((_n: number) => failure(new Error('step failed')))
    const result = step(success(1))
    expect(isFailure(result)).toBe(true)
    expect((result as Error).message).toBe('step failed')
  })

  it('is safe with an Error-subtype payload: a Success value that happens to carry Error-shaped data is never confused with a Failure', () => {
    // The channel discriminates by `instanceof Error`, not by shape — so a
    // chain over a genuinely non-Error success type stays Success end to
    // end, and a chain whose step legitimately fails with a domain Error
    // subclass is carried through as that same subclass, not just `Error`.
    const widgetIdOf = andThen((code: number) =>
      code > 0
        ? success(`widget-${code}`)
        : failure(new WidgetError(String(code))),
    )
    expect(widgetIdOf(success(7))).toBe('widget-7')

    const result = widgetIdOf(success(-1))
    expect(isSuccess(result)).toBe(false)
    expect(result).toBeInstanceOf(WidgetError)
    expect((result as WidgetError).widgetId).toBe('-1')
  })

  it('composes multiple steps left to right', () => {
    const timesTen = andThen((n: number) => success(n * 10))
    const plusOne = andThen((n: number) => success(n + 1))
    expect(plusOne(timesTen(success(4)))).toBe(41)
  })

  it('applies immediately when the value is supplied', () => {
    expect(andThen((n: number) => success(n * 2), success(21))).toBe(42)
    const error = new Error('already broken')
    expect(andThen((n: number) => success(n * 2), failure<number>(error))).toBe(
      error,
    )
  })
})

describe('result / success / failure', () => {
  it('result wraps a plain value as a Success', () => {
    expect(result(5)).toBe(5)
  })

  it('result wraps an Error as a Failure', () => {
    const error = new Error('bad')
    expect(result(error)).toBe(error)
  })

  it('success returns the value unchanged', () => {
    expect(success('x')).toBe('x')
  })

  it('failure returns the error unchanged', () => {
    const error = new Error('bad')
    expect(failure(error)).toBe(error)
  })
})

describe('isSuccess / isFailure', () => {
  it('discriminates by instanceof Error', () => {
    expect(isSuccess(success(1))).toBe(true)
    expect(isSuccess(failure(new Error('x')))).toBe(false)
    expect(isFailure(success(1))).toBe(false)
    expect(isFailure(failure(new Error('x')))).toBe(true)
  })
})

describe('tryCatch', () => {
  it('returns a Success when fn does not throw', () => {
    const safeDivide = tryCatch((a: number, b: number) => a / b)
    expect(safeDivide(10, 2)).toBe(5)
  })

  it('returns a Failure when fn throws, using the thrown value by default', () => {
    const boom = tryCatch(() => {
      throw new Error('kaboom')
    })
    const outcome = boom()
    expect(isFailure(outcome)).toBe(true)
    expect((outcome as Error).message).toBe('kaboom')
  })

  it('runs a non-Error throw through the supplied errorHandler', () => {
    class ParseError extends Error {}
    const boom = tryCatch(
      () => {
        throw 'not an error object'
      },
      () => new ParseError('normalized'),
    )
    expect(boom()).toBeInstanceOf(ParseError)
  })

  it('wraps a non-Error throw so the default still produces a Failure', () => {
    // The hole this closes: a thrown string was passed straight through, and a
    // Result is discriminated by `instanceof Error`, so the "Failure" read as
    // a Success — the failure vanishing into the channel the lift exists to
    // keep it out of.
    const boom = tryCatch(() => {
      throw 'not an error object'
    })
    const outcome = boom()

    expect(isFailure(outcome)).toBe(true)
    expect(isSuccess(outcome)).toBe(false)
    expect(outcome).toBeInstanceOf(ThrownError)
    expect((outcome as ThrownError).thrown).toBe('not an error object')
    expect((outcome as Error).message).toBe('threw not an error object')
  })

  it('keeps a thrown Error as it was thrown, with its subclass intact', () => {
    class ParseError extends Error {}
    const boom = tryCatch(() => {
      throw new ParseError('kaboom')
    })
    const outcome = boom()

    expect(outcome).toBeInstanceOf(ParseError)
    expect(outcome).not.toBeInstanceOf(ThrownError)
  })

  it('describes a thrown value that cannot be rendered', () => {
    // Same defence promise/RejectionError needs, and now the same code: a
    // symbol throws when interpolated, and a null-prototype object has no
    // `toString` to call at all.
    const symbol = Symbol('unrenderable')
    const noPrototype = Object.create(null) as object

    expect(new ThrownError(symbol).message).toBe('threw Symbol(unrenderable)')
    expect(new ThrownError(noPrototype).message).toBe('threw [object Object]')

    const boom = tryCatch(() => {
      throw symbol
    })
    expect((boom() as ThrownError).thrown).toBe(symbol)
  })

  it('lets the errorHandler recover, since it returns a whole Result', () => {
    // The same handler shape promise/resultify takes, which is what makes
    // tryCatch and resultify the sync and async forms of one lift.
    const parse = tryCatch(
      (raw: string) => JSON.parse(raw) as { id: number },
      () => success<{ id: number }>({ id: -1 }),
    )

    expect(parse('{"id":7}')).toEqual({ id: 7 })
    expect(parse('not json')).toEqual({ id: -1 })
    expect(isSuccess(parse('not json'))).toBe(true)
  })
})

describe('assertSuccess', () => {
  it('returns the value for a Success', () => {
    expect(assertSuccess(5)).toBe(5)
  })

  it('rethrows the Error for a Failure', () => {
    const error = new Error('bad')
    expect(() => assertSuccess(error)).toThrow(error)
  })
})

describe('map', () => {
  it('applies fn to a Success', () => {
    expect(map((n: number) => n * 2)(success(21))).toBe(42)
  })

  it('is a no-op on Failure', () => {
    const error = new Error('bad')
    expect(map((n: number) => n * 2)(failure<number>(error))).toBe(error)
  })

  it('applies immediately when the value is supplied', () => {
    expect(map((n: number) => n * 2, success(21))).toBe(42)
    const error = new Error('bad')
    expect(map((n: number) => n * 2, failure<number>(error))).toBe(error)
  })
})

describe('mapError', () => {
  it('passes a Success through without calling fn', () => {
    let called = false
    const outcome = mapError((error: Error) => {
      called = true
      return new WidgetError(error.message)
    })(success(5))
    expect(outcome).toBe(5)
    expect(called).toBe(false)
  })

  it('translates a Failure into the callback’s error, staying a Failure', () => {
    const translated = mapError(
      (error: Error) => new WidgetError(error.message),
    )(failure<number>(new Error('w-1')))
    expect(isFailure(translated)).toBe(true)
    expect(translated).toBeInstanceOf(WidgetError)
    expect((translated as WidgetError).widgetId).toBe('w-1')
  })

  it('may recover, since fn returns a whole Result', () => {
    // The same handler vocabulary tryCatch's errorHandler and
    // promise/resultify's rejection mapper share.
    const recovered = mapError((error: Error) => success(error.message.length))(
      failure<number>(new Error('bad')),
    )
    expect(isSuccess(recovered)).toBe(true)
    expect(recovered).toBe(3)
  })

  it('applies immediately when the value is supplied', () => {
    const error = new Error('w-2')
    expect(
      mapError((error: Error) => new WidgetError(error.message), success(5)),
    ).toBe(5)
    expect(
      mapError(
        (error: Error) => new WidgetError(error.message),
        failure<number>(error),
      ),
    ).toBeInstanceOf(WidgetError)
  })
})

describe('fallback', () => {
  it('passes a Success through without calling fn', () => {
    let called = false
    const outcome = fallback(() => {
      called = true
      return 0
    })(success(5))
    expect(outcome).toBe(5)
    expect(called).toBe(false)
  })

  it('calls fn with the Failure to recover a Success', () => {
    const recovered = fallback((error: Failure<number>) =>
      success(error.message.length),
    )(failure<number>(new Error('bad')))
    expect(recovered).toBe(3)
  })

  it('applies immediately when the value is supplied', () => {
    const recovered = fallback(
      (error: Failure<number>) => success(error.message.length),
      failure<number>(new Error('bad')),
    )
    expect(recovered).toBe(3)
  })
})

describe('orElse', () => {
  it('passes a Success through unchanged', () => {
    expect(orElse(0)(success(5))).toBe(5)
  })

  it('substitutes the eager default for a Failure', () => {
    expect(orElse(0)(failure<number>(new Error('bad')))).toBe(0)
  })

  it('applies immediately when the value is supplied', () => {
    expect(orElse(0, success(5))).toBe(5)
    expect(orElse(0, failure<number>(new Error('bad')))).toBe(0)
  })
})

describe('fromMaybe', () => {
  it('turns a Just into a Success', () => {
    expect(fromMaybe(new Error('unused'))(maybe(5))).toBe(5)
  })

  it('turns Nothing into a Failure carrying the supplied error', () => {
    const error = new Error('missing')
    expect(fromMaybe(error)(nothing())).toBe(error)
  })

  it('applies immediately when the value is supplied', () => {
    expect(fromMaybe(new Error('unused'), maybe(5))).toBe(5)
  })

  it('applies to an explicit Nothing rather than returning the Mapper', () => {
    // Arity is doubly load-bearing here: the value being bridged is a Maybe,
    // so Nothing IS undefined, and a value test could not tell this call
    // from fromMaybe(error) (see docs/adr/0003-currying.md).
    const error = new Error('missing')
    expect(fromMaybe(error, nothing<number>())).toBe(error)
  })
})

describe('type-level', () => {
  it('has no runtime assertions — this block only exists to host type checks', () => {
    expect(true).toBe(true)
  })

  // A Success can never be an Error — that exclusion is what makes the
  // `instanceof Error` discrimination sound.
  type _SuccessNeverError = Expect<
    Equal<Extends<Success<string>, Error>, false>
  >

  // Result<Result<T>> is a distinct type: once formed it is NOT assignable
  // back to Result<T>, unlike Maybe<Maybe<T>>. This is why `andThen` (not
  // nested `map`) is the sanctioned way to chain a second fallible step.
  type _ResultResultNotResult = Expect<
    Equal<Extends<Result<Result<string>>, Result<string>>, false>
  >

  const _typeTests: [_SuccessNeverError, _ResultResultNotResult] = [true, true]
  void _typeTests
})
