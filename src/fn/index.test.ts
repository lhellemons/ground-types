import { describe, expect, it } from 'vitest'
import { compose, constant, curry, identity, pipe } from './index.js'
import type { Function, Mapper } from './index.js'

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
})

describe('pipe', () => {
  const parse = (s: string): number => parseInt(s, 10) || 0
  const double = (n: number): number => n * 2

  it('applies left to right when given an input', () => {
    expect(pipe(parse, double, '21')).toBe(42)
  })

  it('returns the composed Mapper when no input is given', () => {
    const parseAndDouble = pipe(parse, double)
    expect(parseAndDouble('21')).toBe(42)
  })

  it('applies an explicit undefined input rather than withholding it', () => {
    const length: Mapper<string | undefined, number> = (s) => s?.length ?? -1
    expect(pipe(length, double, undefined)).toBe(-2)
  })

  it('mirrors compose, differing only in argument order', () => {
    const inc = (n: number) => n + 1
    expect(pipe(inc, double, 5)).toBe(12)
    expect(compose(double, inc)(5)).toBe(12)
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
})

describe('Function type', () => {
  it('accepts a concrete signature', () => {
    type StringLength = Function<number, [string]>
    const fn: StringLength = (s: string) => s.length
    expect(fn('abc')).toBe(3)
  })
})

describe('Mapper type', () => {
  it('is the unary special case of Function', () => {
    const asMapper: Mapper<string, number> = (s) => s.length
    const asFunction: Function<number, [string]> = asMapper
    expect(asFunction('abcd')).toBe(4)
  })
})
