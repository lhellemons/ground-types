import { expect, test } from 'vitest'
import { AbortError, isAbortError } from './index.js'

test('isAbortError', () => {
  expect(isAbortError(new DOMException('', 'AbortError'))).toBe(true)
  expect(isAbortError(new AbortError())).toBe(true)
  expect(isAbortError(new AbortError('some message'))).toBe(true)
  expect(isAbortError(new DOMException('', 'SomethingElse'))).toBe(false)
  expect(isAbortError(new Error('AbortError'))).toBe(false)
  expect(isAbortError('AbortError')).toBe(false)
  expect(isAbortError(null)).toBe(false)
  expect(isAbortError(undefined)).toBe(false)
})

test('AbortError is an Error, so it can be a Failure', () => {
  expect(new AbortError('aborted')).toBeInstanceOf(Error)
})
