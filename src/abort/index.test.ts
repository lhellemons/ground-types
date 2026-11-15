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

test('isAbortError answers true for a Proxy that reads with the target as receiver', () => {
  const abort = new DOMException('', 'AbortError')
  expect(
    isAbortError(
      new Proxy(abort, { get: (t, k) => Reflect.get(t, k) as unknown }),
    ),
  ).toBe(true)
})

test('isAbortError does not consult DOMException[Symbol.hasInstance]', () => {
  const abort = new DOMException('', 'AbortError')
  const other = new DOMException('', 'SomethingElse')
  const prior = Object.getOwnPropertyDescriptor(
    DOMException,
    Symbol.hasInstance,
  )
  const answers: boolean[] = []
  try {
    for (const hook of [
      (): boolean => false,
      (): never => {
        throw new RangeError('hook')
      },
    ]) {
      Object.defineProperty(DOMException, Symbol.hasInstance, {
        configurable: true,
        value: hook,
      })
      answers.push(isAbortError(abort), isAbortError(other))
    }
  } finally {
    if (prior === undefined) {
      delete (DOMException as { [Symbol.hasInstance]?: unknown })[
        Symbol.hasInstance
      ]
    } else {
      Object.defineProperty(DOMException, Symbol.hasInstance, prior)
    }
  }
  expect(answers).toEqual([true, false, true, false])
})
