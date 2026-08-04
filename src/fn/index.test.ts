import { describe, expect, it } from 'vitest'
import { compose, constant, curry, identity, pipe } from './index.js'
import type { CurryableMapper, Fn, Mapper } from './index.js'

describe('compose', () => {
  it('applies g then f, right to left', () => {
    const double = (n: number) => n * 2
    const toString = (n: number) => `#${n}`
    const doubleThenStringify = compose(toString, double)
    expect(doubleThenStringify(21)).toBe('#42')
  })

  it('is not commutative', () => {
    const double = (n: number) => n * 2
    const inc = (n: number) => n + 1
    expect(compose(double, inc)(5)).toBe(12)
    expect(compose(inc, double)(5)).toBe(11)
  })

  it('applies ten Mappers, the longest chain compose has an overload for, last argument first', () => {
    const dec = (n: number): number => n - 1
    expect(compose(dec, dec, dec, dec, dec, dec, dec, dec, dec, dec)(10)).toBe(
      0,
    )
  })
})

describe('pipe', () => {
  const double = (n: number): number => n * 2

  it('applies a single step to the value', () => {
    expect(pipe(21, double)).toBe(42)
  })

  it('applies two steps left to right', () => {
    const toString = (n: number): string => `#${n}`
    expect(pipe(21, double, toString)).toBe('#42')
  })

  it('applies three steps left to right', () => {
    const toString = (n: number): string => `#${n}`
    const shout = (s: string): string => s.toUpperCase()
    expect(pipe(21, double, toString, shout)).toBe('#42')
  })

  it('applies ten steps, the longest chain pipe has an overload for', () => {
    const inc = (n: number): number => n + 1
    expect(pipe(0, inc, inc, inc, inc, inc, inc, inc, inc, inc, inc)).toBe(10)
  })
})

describe('identity', () => {
  it('returns its input exactly', () => {
    const obj = { prop: 'value' }
    const arr = ['one', 'two', 'three']

    expect(identity(null)).toBe(null)
    expect(identity(undefined)).toBe(undefined)
    expect(identity('string')).toBe('string')
    expect(identity(42)).toBe(42)
    expect(identity(true)).toBe(true)
    expect(identity(obj)).toBe(obj)
    expect(identity(arr)).toBe(arr)
  })
})

describe('constant', () => {
  it('returns a function that always returns the given value', () => {
    const obj = { prop: 'value' }

    expect(constant(null)()).toBe(null)
    expect(constant(undefined)()).toBe(undefined)
    expect(constant('string')()).toBe('string')
    expect(constant(42)()).toBe(42)
    expect(constant(obj)()).toBe(obj)
  })

  it('ignores whatever arguments it is passed', () => {
    expect(constant('fixed')('a', 1, null)).toBe('fixed')
  })
})

describe('curry', () => {
  const stringify: Mapper<unknown, string> = (value) => JSON.stringify(value)

  it('applies the mapper when an input is given', () => {
    expect(curry(stringify, { foo: 'bar' })).toBe('{"foo":"bar"}')
  })

  it('returns the mapper when no input is given', () => {
    const curried = curry(stringify)
    expect(curried).toBeTypeOf('function')
    expect((curried as Mapper<unknown, string>)({ foo: 'bar' })).toBe(
      '{"foo":"bar"}',
    )
  })

  it('applies the mapper to an explicit undefined rather than withholding it', () => {
    // The regression this guards: `Nothing` is `undefined` in this library,
    // so deciding by value rather than by arity would return the mapper here.
    const describeMaybe: Mapper<string | undefined, string> = (value) =>
      value === undefined ? 'nothing' : `just ${value}`

    expect(curry(describeMaybe, undefined)).toBe('nothing')
    expect(curry(describeMaybe, 'widget')).toBe('just widget')
    expect(curry(describeMaybe)).toBeTypeOf('function')
  })

  it('backs a consumer-written curryable combinator, applied and deferred', () => {
    // Mirrors curry's own docblock example: a combinator built the same way
    // promise/resultify and call/resultify are, to confirm the documented
    // pattern actually compiles and runs, not just reads plausibly.
    function scaleBy(factor: number, input: number): number
    function scaleBy(factor: number): Mapper<number, number>
    function scaleBy(
      factor: number,
      ...input: [] | [number]
    ): CurryableMapper<number, number> {
      return curry((n: number) => n * factor, ...input)
    }

    expect(scaleBy(2, 21)).toBe(42)
    const double = scaleBy(2)
    expect(double).toBeTypeOf('function')
    expect(double(21)).toBe(42)
  })
})

describe('Fn type', () => {
  it('accepts a concrete signature', () => {
    type StringLength = Fn<number, [string]>
    const fn: StringLength = (s: string) => s.length
    expect(fn('abc')).toBe(3)
  })
})

describe('Mapper type', () => {
  it('is the unary special case of Fn', () => {
    const asMapper: Mapper<string, number> = (s) => s.length
    const asFunction: Fn<number, [string]> = asMapper
    expect(asFunction('abcd')).toBe(4)
  })
})
