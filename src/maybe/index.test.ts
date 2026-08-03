import { describe, expect, it } from 'vitest'
import {
  andThen,
  assertJust,
  fallback,
  fromResult,
  isJust,
  isNothing,
  just,
  map,
  maybe,
  nothing,
  orElse,
} from './index.js'
import type { Just, Maybe, Nothing } from './index.js'
import { failure, success } from '../result/index.js'

// Tuple-wrapped so the checks don't distribute over union types.
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type Extends<A, B> = [A] extends [B] ? true : false
type Expect<T extends true> = T

describe('maybe / just / nothing', () => {
  it('maybe wraps a defined value as Just', () => {
    expect(maybe(1)).toBe(1)
  })

  it('maybe wraps undefined as Nothing', () => {
    expect(maybe(undefined)).toBeUndefined()
  })

  it('just returns the value unchanged', () => {
    expect(just('x')).toBe('x')
  })

  it('nothing returns undefined', () => {
    expect(nothing()).toBeUndefined()
  })
})

describe('isJust / isNothing', () => {
  it('discriminates Just from Nothing', () => {
    expect(isJust(maybe(1))).toBe(true)
    expect(isJust(maybe(undefined))).toBe(false)
    expect(isNothing(maybe(1))).toBe(false)
    expect(isNothing(maybe(undefined))).toBe(true)
  })
})

describe('orElse', () => {
  it('passes a Just through unchanged', () => {
    expect(orElse(0)(maybe(5))).toBe(5)
  })

  it('substitutes the eager default for Nothing', () => {
    expect(orElse(0)(nothing())).toBe(0)
  })
})

describe('fallback', () => {
  it('passes a Just through without calling fn', () => {
    let called = false
    const result = fallback(() => {
      called = true
      return 0
    })(maybe(5))
    expect(result).toBe(5)
    expect(called).toBe(false)
  })

  it('calls fn to produce the default for Nothing', () => {
    expect(fallback(() => 99)(nothing())).toBe(99)
  })
})

describe('map', () => {
  it('applies fn to a Just', () => {
    expect(map((n: number) => n * 2)(maybe(21))).toBe(42)
  })

  it('is a no-op on Nothing', () => {
    expect(map((n: number) => n * 2)(nothing())).toBeUndefined()
  })
})

describe('andThen', () => {
  it('is the same function as map, not merely equivalent', () => {
    expect(andThen).toBe(map)
  })

  it('does not nest when fn itself returns a Maybe', () => {
    const halveIfEven = andThen((n: number) =>
      n % 2 === 0 ? maybe(n / 2) : nothing<number>(),
    )
    expect(halveIfEven(maybe(10))).toBe(5)
    expect(halveIfEven(maybe(3))).toBeUndefined()
  })
})

describe('assertJust', () => {
  it('returns the value for a Just', () => {
    expect(assertJust(maybe(5))).toBe(5)
  })

  it('throws a sensible default message for Nothing', () => {
    expect(() => assertJust<number>(nothing())).toThrow()
  })

  it('throws the supplied message for Nothing', () => {
    expect(() => assertJust<number>(nothing(), 'boom')).toThrow('boom')
  })
})

describe('fromResult', () => {
  it('turns a Success into a Just', () => {
    expect(fromResult(success(5))).toBe(5)
  })

  it('turns a Failure into Nothing, discarding the error', () => {
    expect(fromResult(failure(new Error('bad')))).toBeUndefined()
  })
})

describe('type-level', () => {
  it('has no runtime assertions — this block only exists to host type checks', () => {
    expect(true).toBe(true)
  })

  // Maybe<Maybe<T>> and Maybe<T> are mutually assignable: nesting never
  // actually occurs, which is why `flatten` was deleted.
  type _MaybeMaybeIsMaybe = Expect<Equal<Maybe<Maybe<string>>, Maybe<string>>>

  type _JustIsMaybe = Expect<Extends<Just<string>, Maybe<string>>>
  type _NothingIsUndefined = Expect<Equal<Nothing<string>, undefined>>

  const _typeTests: [_MaybeMaybeIsMaybe, _JustIsMaybe, _NothingIsUndefined] = [
    true,
    true,
    true,
  ]
  void _typeTests
})
