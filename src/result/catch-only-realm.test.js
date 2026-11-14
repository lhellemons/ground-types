import { runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'
import { catchOnly, isFailure, tryCatch } from './index.js'

it('rethrows foreign-realm errors by identity even when their class is listed', () => {
  const ForeignError = runInNewContext(
    'class ForeignError extends Error {}; ForeignError',
  )
  const error = new ForeignError()
  expect(error instanceof Error).toBe(false)
  expect(isFailure(error)).toBe(false)
  for (const invoke of [
    () => catchOnly(ForeignError)(error),
    () =>
      tryCatch(() => {
        throw error
      }, [ForeignError])(),
  ]) {
    let caught = false
    try {
      invoke()
    } catch (thrown) {
      caught = true
      expect(thrown).toBe(error)
    }
    expect(caught).toBe(true)
  }
})
