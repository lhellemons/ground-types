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
  // Not detected: a constructor from another realm is not this realm's
  // `Error`, so the handler check admits it, and it builds a foreign error
  // that is not a Failure here. TypeScript rejects it.
  it('are admitted and return a foreign error as a Success', () => {
    const result = tryCatch(() => {
      throw new Error('boom')
    }, ForeignTypeError)()
    expect(result).toBeInstanceOf(ForeignTypeError)
    expect(isFailure(result)).toBe(false)
  })
})
