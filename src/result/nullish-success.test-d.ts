/* The `null` and `undefined` arms of `Success` (docs/adr/0001-unboxed-maybe-
   and-result.md, the 2026-11-15 amendment). Before the amendment
   `Success<undefined>` and `Success<null>` reduced to `never`, so
   `success(undefined)` fitted any `Result` and the Success arm of
   `Result<number | undefined, E>` lost its `undefined`. */
import { describe, expectTypeOf, it } from 'vitest'
import { isFailure, isSuccess, success } from './index.js'
import type { Failure, Result, Success } from './index.js'

class Invalid extends Error {
  readonly code = 'invalid' as const
}

interface User {
  readonly id: string
}

declare const maybeNumber: Result<number | undefined, Invalid>

describe('before the amendment: a nullish Success reduces to never', () => {
  it('success(undefined) and success(null) are never', () => {
    expectTypeOf(success(undefined)).toBeNever()
    expectTypeOf(success(null)).toBeNever()
    expectTypeOf<Success<undefined, Invalid>>().toBeNever()
    expectTypeOf<Success<null, Invalid>>().toBeNever()
  })

  it('so success(undefined) fits a Result whose value type has no undefined', () => {
    const f = (): Result<User, Invalid> => success(undefined)
    const g = (): Result<User, Invalid> => success(null)
    void [f, g]
  })

  it('so Result<undefined, E> is its Failure arm alone', () => {
    expectTypeOf<Result<undefined, Invalid>>().toEqualTypeOf<
      Failure<undefined, Invalid>
    >()
  })

  it('so narrowing a Result<number | undefined, E> with !isFailure drops undefined', () => {
    if (!isFailure(maybeNumber)) {
      expectTypeOf<undefined>().not.toExtend<typeof maybeNumber>()
      if (maybeNumber === undefined) {
        // the branch that handles the undefined value is typed unreachable
        expectTypeOf(maybeNumber).toBeNever()
      }
    }
    if (isSuccess(maybeNumber)) {
      expectTypeOf<undefined>().not.toExtend<typeof maybeNumber>()
    }
  })
})
