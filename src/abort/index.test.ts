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

test('isAbortError answers false for a value whose checks throw', () => {
  const trap = (): never => {
    throw new RangeError('trap')
  }
  // `instanceof` throws: the `getPrototypeOf` trap.
  expect(isAbortError(new Proxy({}, { getPrototypeOf: trap }))).toBe(false)
  // `instanceof` passes (a real DOMException behind the proxy), then the
  // `name` read throws: the `get` trap.
  expect(
    isAbortError(new Proxy(new DOMException('', 'AbortError'), { get: trap })),
  ).toBe(false)
  // A Proxy with no traps over a real abort: `instanceof` passes, but the
  // `name` getter rejects the proxy as its receiver, so it throws.
  expect(isAbortError(new Proxy(new DOMException('', 'AbortError'), {}))).toBe(
    false,
  )
  // A `get` trap that forwards the read with the proxy as receiver throws
  // the same way; only one that reads with the target as receiver answers.
  const target = new DOMException('', 'AbortError')
  expect(
    isAbortError(
      new Proxy(target, { get: (t, k, r) => Reflect.get(t, k, r) as unknown }),
    ),
  ).toBe(false)
  // A revoked proxy throws on `instanceof`.
  const { proxy, revoke } = Proxy.revocable({}, {})
  revoke()
  expect(isAbortError(proxy)).toBe(false)
})
