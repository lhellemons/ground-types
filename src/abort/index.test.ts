import { AbortError, isAbortError } from './index.js'

test('isAbortError', () => {
  expect(isAbortError(new DOMException('', 'AbortError'))).toBeTrue()
  expect(isAbortError(new AbortError())).toBeTrue()
  expect(isAbortError(new AbortError('some message'))).toBeTrue()
  expect(isAbortError(new DOMException('', 'SomethingElse'))).toBeFalse()
  expect(isAbortError(new Error('AbortError'))).toBeFalse()
  expect(isAbortError('AbortError')).toBeFalse()
  expect(isAbortError(null)).toBeFalse()
  expect(isAbortError(undefined)).toBeFalse()
})

test('AbortError is an Error, so it can be a Failure', () => {
  expect(new AbortError('aborted')).toBeInstanceOf(Error)
})
