import { describe, expect, it } from 'vitest'
import { catchOnly, isFailure, tryCatch } from './index.js'
import { resultify } from '../promise/index.js'
import { resultify as callResultify } from '../call/index.js'
import { definePrimitiveValueObject } from '../value-object/index.js'
import type { Branded } from '../brand/index.js'

class A extends Error {}
class B extends A {}
class Other extends Error {}
const unexpected = [new TypeError(), {}, null, undefined, 'bad']
function throws(value: unknown): never {
  throw value
}
function expectThrow(fn: () => unknown, value: unknown) {
  let caught = false
  try {
    fn()
  } catch (error) {
    caught = true
    expect(error).toBe(value)
  }
  expect(caught).toBe(true)
}

describe('catchOnly', () => {
  it('preserves selected errors and subclasses unchanged', () => {
    for (const error of [new A(), new B(), new Other()]) {
      const result = catchOnly(A, Other)(error)
      expect(result).toBe(error)
      expect(isFailure(result)).toBe(true)
    }
  })
  it('rethrows all other values by identity', () => {
    for (const value of unexpected)
      expectThrow(() => catchOnly(A)(value), value)
  })
})

describe('tryCatch shorthand', () => {
  it('catches bound constructors inside a list', () => {
    const error = new A()
    expect(tryCatch(() => throws(error), [A.bind(null)])()).toBe(error)
    expect(tryCatch(() => throws(error), [Error.bind(null)])()).toBe(error)
  })
  it('catches each unrelated class in a list', () => {
    for (const error of [new A(), new Other()]) {
      expect(tryCatch(() => throws(error), [A, Other])()).toBe(error)
    }
  })
  it('catches a subclass with a one-class list', () => {
    const error = new B()
    expect(tryCatch(() => throws(error), [A])()).toBe(error)
  })
  it('rethrows unlisted values for one-class and multi-class lists', () => {
    for (const value of unexpected) {
      expectThrow(() => tryCatch(() => throws(value), [A])(), value)
      expectThrow(() => tryCatch(() => throws(value), [A, Other])(), value)
    }
  })
})

describe('value-object catchOnly handler', () => {
  it('returns selected failures while the callable form still throws', () => {
    const error = new B()
    const factory = definePrimitiveValueObject((value: string) => {
      if (value === 'bad') throw error
      return value as Branded<string, 'Test'>
    }, catchOnly(A))
    expect(factory('ok')).toBe('ok')
    expect(factory.from('ok')).toBe('ok')
    expect(factory.from('bad')).toBe(error)
    expect(isFailure(factory.from('bad'))).toBe(true)
    expectThrow(() => factory('bad'), error)
  })
  it('rethrows unexpected values from both forms', () => {
    for (const value of unexpected) {
      const factory = definePrimitiveValueObject((_input: string) => {
        throws(value)
        return '' as Branded<string, 'Test'>
      }, catchOnly(A))
      expectThrow(() => factory.from('x'), value)
      expectThrow(() => factory('x'), value)
    }
  })
})

describe('promise resultify catchOnly handler', () => {
  it('preserves selected rejections', async () => {
    const error = new B()
    expect(await resultify(catchOnly(A), Promise.reject(error))).toBe(error)
  })
  it('propagates unlisted rejections', async () => {
    for (const value of unexpected)
      await expect(resultify(catchOnly(A), Promise.reject(value))).rejects.toBe(
        value,
      )
  })
})

describe('call resultify catchOnly handler', () => {
  it('preserves selected synchronous throws and rejections', async () => {
    const error = new B()
    expect(await callResultify(catchOnly(A), () => throws(error))()).toBe(error)
    expect(
      await callResultify(catchOnly(A), () => Promise.reject(error))(),
    ).toBe(error)
  })
  it('propagates unlisted synchronous throws and rejections', async () => {
    for (const value of unexpected) {
      await expect(
        callResultify(catchOnly(A), () => throws(value))(),
      ).rejects.toBe(value)
      await expect(
        callResultify(catchOnly(A), () => Promise.reject(value))(),
      ).rejects.toBe(value)
    }
  })
})
