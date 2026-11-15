/* The `null`, `undefined` and `void` arms of `Success` (docs/adr/0001-unboxed-
   maybe-and-result.md, the 2026-11-15 amendment). On 0.4.0 and the
   2026-11-14 signatures `Success<undefined>` and `Success<null>` reduced to
   `never`, so `success(undefined)` fitted any `Result` and the Success arm
   of `Result<number | undefined, E>` lost its `undefined`; the first commit
   of this file pinned both effects on those signatures. */
import { describe, expectTypeOf, it } from 'vitest'
import {
  andThen,
  failure,
  isFailure,
  isSuccess,
  map,
  orElse,
  result,
  success,
  tryCatch,
} from './index.js'
import type { Failure, Result, Success } from './index.js'
import { fromResult } from '../maybe/index.js'
import type { Maybe } from '../maybe/index.js'

class Invalid extends Error {
  readonly code = 'invalid' as const
}
class Other extends Error {
  readonly code = 'other' as const
}

interface User {
  readonly id: string
}

declare const maybeNumber: Result<number | undefined, Invalid>
declare const nullableNumber: Result<number | null, Invalid>
declare const nothing: Result<undefined, Invalid>

describe('a nullish value keeps its own Success arm', () => {
  it('success(undefined), success(null) and success(void) are the bare value', () => {
    expectTypeOf(success(undefined)).toEqualTypeOf<undefined>()
    expectTypeOf(success(null)).toEqualTypeOf<null>()
    expectTypeOf(success<void>(undefined)).toEqualTypeOf<void>()
    expectTypeOf<Success<undefined, Invalid>>().toEqualTypeOf<undefined>()
    expectTypeOf<Success<null, Invalid>>().toEqualTypeOf<null>()
    expectTypeOf<Success<void, Invalid>>().toEqualTypeOf<void>()
  })

  it('the error phantom is gone from a nullish arm, whatever E is', () => {
    expectTypeOf<Success<undefined, Invalid>>().toEqualTypeOf<
      Success<undefined, Other>
    >()
    expectTypeOf<Result<undefined, Invalid>>().toEqualTypeOf<
      Failure<undefined, Invalid> | undefined
    >()
  })

  it('a mixed T splits: the non-nullish part keeps its markers', () => {
    expectTypeOf<null>().toExtend<Success<number | null, Invalid>>()
    expectTypeOf<undefined>().not.toExtend<Success<number | null, Invalid>>()
    expectTypeOf<undefined>().toExtend<Success<number | undefined, Invalid>>()
    expectTypeOf<Success<number, Invalid>>().toExtend<
      Success<number | undefined, Invalid>
    >()
    expectTypeOf<Success<number | undefined, Invalid>>().not.toExtend<
      Success<number, Invalid>
    >()
    expectTypeOf<
      Exclude<Success<number | undefined, Invalid>, undefined>
    >().toExtend<number>()
  })

  it('an Error member of T is still dropped, a nullish one beside it kept', () => {
    expectTypeOf<
      Success<Invalid | undefined, Other>
    >().toEqualTypeOf<undefined>()
    expectTypeOf<Success<Invalid, Other>>().toBeNever()
  })
})

describe('success(undefined) fits only a Result that admits undefined', () => {
  it('it no longer fits a Result whose value type lacks it', () => {
    // @ts-expect-error - undefined is not a User
    const f = (): Result<User, Invalid> => success(undefined)
    // @ts-expect-error - null is not a User
    const g = (): Result<User, Invalid> => success(null)
    // @ts-expect-error - undefined is not null
    const h = (): Result<null, Invalid> => success(undefined)
    // @ts-expect-error - null is not undefined
    const i = (): Result<undefined, Invalid> => success(null)
    void [f, g, h, i]
  })

  it('it fits a Result that does', () => {
    const f = (): Result<User | undefined, Invalid> => success(undefined)
    const g = (): Result<undefined, Invalid> => success(undefined)
    const h = (): Result<void, Invalid> => success(undefined)
    const i = (): Result<number | null, Invalid> => success(null)
    const j = (): Result<void, Invalid | Other> => success(undefined)
    expectTypeOf(f).returns.toEqualTypeOf<Result<User | undefined, Invalid>>()
    expectTypeOf(g).returns.toEqualTypeOf<Result<undefined, Invalid>>()
    void [h, i, j]
  })

  it('and a value-carrying success still fits a Result with a nullish arm', () => {
    const f = (n: number): Result<number | undefined, Invalid> => success(n)
    expectTypeOf(f).returns.toEqualTypeOf<Result<number | undefined, Invalid>>()
  })

  it('an optional value passes through success without losing undefined', () => {
    const f = (n?: number): Result<number | undefined, Invalid> => success(n)
    expectTypeOf(f).returns.toEqualTypeOf<Result<number | undefined, Invalid>>()
  })

  it('a Failure is still not a Success of a nullish T', () => {
    // @ts-expect-error - a Failure is not undefined
    const f = (): Result<undefined, Invalid> => failure(new Other())
    void f
  })
})

describe('narrowing a Result whose value type has a nullish member', () => {
  it('!isFailure keeps undefined, so the branch that handles it is reachable', () => {
    if (!isFailure(maybeNumber)) {
      expectTypeOf<undefined>().toExtend<typeof maybeNumber>()
      if (maybeNumber === undefined) {
        expectTypeOf(maybeNumber).toEqualTypeOf<undefined>()
      } else {
        expectTypeOf(maybeNumber).toExtend<number>()
      }
    }
  })

  it('isSuccess keeps undefined; isFailure leaves only the Failure', () => {
    if (isSuccess(maybeNumber)) {
      expectTypeOf<undefined>().toExtend<typeof maybeNumber>()
    } else {
      expectTypeOf(maybeNumber).toEqualTypeOf<
        Failure<number | undefined, Invalid>
      >()
    }
    if (isFailure(maybeNumber)) {
      expectTypeOf(maybeNumber).toEqualTypeOf<
        Failure<number | undefined, Invalid>
      >()
    }
  })

  it('null is kept the same way', () => {
    if (!isFailure(nullableNumber)) {
      expectTypeOf<null>().toExtend<typeof nullableNumber>()
      expectTypeOf<undefined>().not.toExtend<typeof nullableNumber>()
    }
  })

  it('a Result<undefined, E> narrows to undefined', () => {
    if (!isFailure(nothing)) {
      expectTypeOf(nothing).toEqualTypeOf<undefined>()
    }
  })
})

describe('the combinators carry a nullish value', () => {
  it('map over a Result<number | undefined, E> hands the callback the undefined', () => {
    const doubled = map((n: number | undefined) => (n ?? 0) * 2, maybeNumber)
    expectTypeOf(doubled).toEqualTypeOf<Result<number, Invalid>>()
  })

  it('map to a nullish value keeps it in the value arm', () => {
    const next = map((n: number) => (n > 0 ? n : undefined), result(1))
    expectTypeOf(next).toExtend<Result<number | undefined, Error>>()
    expectTypeOf<undefined>().toExtend<typeof next>()
  })

  it('andThen to a Result with a nullish value', () => {
    const f = andThen((n: number): Result<number | undefined, Other> =>
      n > 0 ? success(n) : success(undefined),
    )
    expectTypeOf(f(success(1) as Result<number, Invalid>)).toEqualTypeOf<
      Result<number | undefined, Invalid | Other>
    >()
  })

  it('orElse over a Result<number | undefined, E> yields the value arm', () => {
    const value = orElse(0, maybeNumber)
    expectTypeOf(value).toExtend<number | undefined>()
    expectTypeOf<undefined>().toExtend<typeof value>()
  })

  it('result() of a value with a nullish member keeps it in the value arm', () => {
    expectTypeOf(result(undefined)).toEqualTypeOf<Result<undefined, never>>()
    expectTypeOf(result(null as number | null)).toEqualTypeOf<
      Result<number | null, never>
    >()
  })

  it('tryCatch of a function returning undefined', () => {
    const run = tryCatch(
      () => undefined,
      () => failure(new Invalid()),
    )
    expectTypeOf(run()).toEqualTypeOf<Result<undefined, Invalid>>()
  })

  it('fromResult bridges a nullish value into a Maybe', () => {
    expectTypeOf(fromResult(maybeNumber)).toEqualTypeOf<Maybe<number>>()
  })
})

describe('ADR 0001 guarantees hold with a nullish arm', () => {
  it('a Success is never an Error, whatever sits beside it', () => {
    expectTypeOf<Error>().not.toExtend<Success<number | undefined, Invalid>>()
    expectTypeOf<Invalid>().not.toExtend<Success<Invalid | null, Other>>()
    expectTypeOf<Failure<number, Invalid>>().not.toExtend<
      Success<number | undefined, Invalid>
    >()
  })

  it('Result<Result<T>> is still not assignable to Result<T>', () => {
    expectTypeOf<
      Result<Result<number | undefined, Invalid>, Invalid>
    >().not.toExtend<Result<number | undefined, Invalid>>()
    expectTypeOf<Result<Result<undefined, Invalid>, Invalid>>().not.toExtend<
      Result<undefined, Invalid>
    >()
  })

  it('a plain Error is still not a Result<number | undefined, Invalid>', () => {
    expectTypeOf<Error>().not.toExtend<Result<number | undefined, Invalid>>()
    expectTypeOf<Error>().not.toExtend<Result<undefined, Invalid>>()
  })
})
