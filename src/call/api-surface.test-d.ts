import { describe, expectTypeOf, it } from 'vitest'
import type { AbortableCall, AsyncCall, Call } from './index.js'
import type { AbortablePromise } from '../promise/index.js'

/**
 * Pins `/call`'s type-only exports — invisible at runtime, so untouched by
 * `test/api-surface/call.test.ts`. Referencing each by name means a
 * removal or rename fails typecheck instead of silently dropping from the
 * public surface. See that file's docblock for the full rationale.
 */
describe('/call type exports', () => {
  it('Call<O, I> may settle synchronously or asynchronously', () => {
    expectTypeOf<Call<number, string>>().toEqualTypeOf<
      (input: string) => number | Promise<number>
    >()
  })

  it('bare Call defaults to no input and no output', () => {
    expectTypeOf<Call>().toEqualTypeOf<(input: void) => void | Promise<void>>()
  })

  it('AsyncCall<O, I> always returns a Promise', () => {
    expectTypeOf<AsyncCall<number, string>>().toEqualTypeOf<
      (input: string) => Promise<number>
    >()
  })

  it('AbortableCall<O, I> returns an abortable Promise', () => {
    expectTypeOf<AbortableCall<number, string>>().toEqualTypeOf<
      (input: string) => AbortablePromise<number>
    >()
  })
})
