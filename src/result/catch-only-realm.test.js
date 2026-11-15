import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { catchOnly, isFailure, tryCatch } from './index.js'
import { resultify } from '../promise/index.js'
import { resultify as callResultify } from '../call/index.js'
import { definePrimitiveValueObject } from '../value-object/index.js'

// Kept as .js: tsconfig deliberately omits @types/node, so `node:vm` would
// not typecheck from a .ts file.
const ForeignError = runInNewContext(
  'class ForeignError extends Error {}; ForeignError',
)

const ForeignTypeError = runInNewContext('TypeError')

function expectThrown(invoke, value) {
  let caught = false
  try {
    invoke()
  } catch (thrown) {
    caught = true
    expect(thrown).toBe(value)
  }
  expect(caught).toBe(true)
}

describe('foreign-realm errors with a listed class', () => {
  it('are rethrown by identity from catchOnly and tryCatch', () => {
    const error = new ForeignError()
    expect(error instanceof Error).toBe(false)
    expect(isFailure(error)).toBe(false)
    expectThrown(() => catchOnly(ForeignError)(error), error)
    expectThrown(
      () =>
        tryCatch(() => {
          throw error
        }, [ForeignError])(),
      error,
    )
  })

  it('are rethrown from both forms of a value-object factory', () => {
    const error = new ForeignError()
    const factory = definePrimitiveValueObject(() => {
      throw error
    }, catchOnly(ForeignError))
    expectThrown(() => factory.from('x'), error)
    // The callable form calls `construct` directly; it only passes the error through.
    expectThrown(() => factory('x'), error)
  })

  it('are propagated by promise resultify', async () => {
    const error = new ForeignError()
    await expect(
      resultify(catchOnly(ForeignError), Promise.reject(error)),
    ).rejects.toBe(error)
  })

  it('are propagated by call resultify', async () => {
    const error = new ForeignError()
    await expect(
      callResultify(catchOnly(ForeignError), () => {
        throw error
      })(),
    ).rejects.toBe(error)
    await expect(
      callResultify(catchOnly(ForeignError), () => Promise.reject(error))(),
    ).rejects.toBe(error)
  })
})

describe('foreign-realm error constructors as a tryCatch handler', () => {
  // A built-in one is refused through its native source and own `prototype`.
  // Not detected: an ES5-style constructor from another realm has none of this
  // realm's `Error.prototype` on its chain, so the handler check admits it,
  // and what it builds is not a Failure here. TypeScript rejects it. A foreign
  // `class ... extends Error` is refused by its source text.
  const ForeignEs5 = runInNewContext(
    'function Es5Error() {}; Es5Error.prototype = Object.create(Error.prototype); Es5Error',
  )
  const boom = () => {
    throw new Error('boom')
  }

  it('refuses a built-in one', () => {
    expect(() => tryCatch(boom, ForeignTypeError)).toThrow(TypeError)
    expect(() => tryCatch(boom, runInNewContext('Map'))).toThrow(TypeError)
  })
  it('admits an ES5-style one, which returns undefined as a Success', () => {
    expect(tryCatch(boom, ForeignEs5)()).toBeUndefined()
  })
  it('refuses a foreign class that extends Error', () => {
    expect(() => tryCatch(boom, ForeignError)).toThrow(TypeError)
  })
})
