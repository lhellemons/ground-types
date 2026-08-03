import { AbortError, isAbortError, withSignal } from './abort.js'

test('withSignal', () => {
  let requestInit: RequestInit = {}
  const controller = new AbortController()

  requestInit = withSignal(controller.signal)(requestInit)

  expect(requestInit.signal).toEqual(controller.signal)
})

test('isAbortError', async () => {
  expect(isAbortError(new DOMException('', 'AbortError'))).toBeTrue()
  expect(isAbortError(new AbortError())).toBeTrue()
  expect(isAbortError(new AbortError('some message'))).toBeTrue()
  expect(isAbortError(new DOMException('', 'SomethingElse'))).toBeFalse()
  expect(isAbortError(new Error('AbortError'))).toBeFalse()
  expect(isAbortError('AbortError')).toBeFalse()
  expect(isAbortError(null)).toBeFalse()
  expect(isAbortError(undefined)).toBeFalse()

  // @ts-ignore abort() exists on AbortSignal
  await expect(fetch('', { signal: AbortSignal.abort() })).rejects.toSatisfy(
    isAbortError,
  )
})
