import { expect, it } from 'vitest'
import { catchOnly, tryCatch } from './index.js'
import { resultify } from '../promise/index.js'
import { resultify as callResultify } from '../call/index.js'

class A extends Error {}
class B extends A {}

it('preserves subclasses and rethrows every other value by identity', async () => {
  const error = new B()
  expect(catchOnly(A)(error)).toBe(error)
  expect(
    tryCatch(() => {
      throw error
    }, A)(),
  ).toBe(error)
  expect(
    tryCatch(() => {
      throw error
    }, [A])(),
  ).toBe(error)
  expect(await resultify(catchOnly(A), Promise.reject(error))).toBe(error)
  expect(
    await callResultify(catchOnly(A), () => {
      throw error
    })(),
  ).toBe(error)
  for (const other of [new TypeError(), {}, null, undefined, 'bad']) {
    try {
      catchOnly(A)(other)
      expect.fail('must throw')
    } catch (caught) {
      expect(caught).toBe(other)
    }
    await expect(resultify(catchOnly(A), Promise.reject(other))).rejects.toBe(
      other,
    )
  }
})
