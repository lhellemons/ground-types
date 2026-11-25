import { expectTypeOf, it } from 'vitest'
import { result } from './index.js'
import type { Failure, Result, SuccessArm } from './index.js'

class Invalid extends Error {
  readonly code = 'invalid' as const
}

declare const numberNested: Result<Result<number, Invalid>, Invalid>
declare const objectNested: Result<Result<object, Invalid>, Invalid>
declare const unknownNested: Result<Result<unknown, Invalid>, Invalid>

it('rejects direct number nesting but permits object and unknown nesting', () => {
  // @ts-expect-error - the number phantom prevents direct flattening
  const numberFlat: Result<number, Invalid> = numberNested
  const objectFlat: Result<object, Invalid> = objectNested
  const unknownFlat: Result<unknown, Invalid> = unknownNested
  expectTypeOf(numberFlat).toEqualTypeOf<Result<number, Invalid>>()
  expectTypeOf(objectFlat).toEqualTypeOf<Result<object, Invalid>>()
  expectTypeOf(unknownFlat).toEqualTypeOf<Result<unknown, Invalid>>()
})

it('lifts nested numbers assignably while retaining nested phantoms', () => {
  const lifted = result(numberNested)
  expectTypeOf(lifted).toMatchTypeOf<Result<number, Invalid>>()
  expectTypeOf(lifted).toEqualTypeOf<
    Result<
      SuccessArm<Result<number, Invalid>, Invalid>,
      Failure<Result<number, Invalid>, Invalid>
    >
  >()
  expectTypeOf(lifted).not.toEqualTypeOf<Result<number, Invalid>>()
})
