import { describe, expect, it } from 'vitest'
import { compose } from './index.js'
import type { Function } from './index.js'

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

describe('Function type', () => {
  it('accepts a concrete signature', () => {
    type StringLength = Function<number, [string]>
    const fn: StringLength = (s: string) => s.length
    expect(fn('abc')).toBe(3)
  })
})
