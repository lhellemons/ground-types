/* The `null`, `undefined` and `void` arms of `Success` (docs/adr/0001-unboxed-
   maybe-and-result.md, the 2026-11-15 amendment). On 0.4.0 and the
   2026-11-14 signatures `Success<undefined>` and `Success<null>` reduced to
   `never`, so `success(undefined)` fitted any `Result` and the Success arm
   of `Result<number | undefined, E>` lost its `undefined`. */
import { describe, expectTypeOf, it } from 'vitest'
import {
  andThen,
  failure,
  isFailure,
  fallback,
  isSuccess,
  map,
  mapError,
  orElse,
  result,
  success,
  tryCatch,
} from './index.js'
import type { Failure, Result, Success } from './index.js'
import { act } from './act.js'
import { Result as ResultBox } from './box.js'
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
declare const nullableString: Result<string | null, Invalid>
declare const nullableNumber: Result<number | null, Invalid>
declare const nothing: Result<undefined, Invalid>
declare const maybe: Maybe<number>
declare const opt: number | undefined
declare const mn: Result<Maybe<number>, Invalid>
declare function step(): Result<number, Invalid>

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
    void [f, g, h, i, j]
  })

  it('and a value-carrying success still fits a Result with a nullish arm', () => {
    const f = (n: number): Result<number | undefined, Invalid> => success(n)
    void f
  })

  it('an optional value passes through success without losing undefined', () => {
    const f = (n?: number): Result<number | undefined, Invalid> => success(n)
    void f
    // The `undefined` stays in the value type: on 0.4.0 `success(n)` lost it.
    const s = success(undefined as number | undefined)
    expectTypeOf<undefined>().toExtend<typeof s>()
    expectTypeOf(s).toEqualTypeOf<Success<number | undefined, never>>()
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
    expectTypeOf(next).toEqualTypeOf<Result<number | undefined, never>>()
  })

  it('andThen to a Result with a nullish value', () => {
    const f = andThen((n: number): Result<number | undefined, Other> =>
      n > 0 ? success(n) : success(undefined),
    )
    expectTypeOf(f(step())).toEqualTypeOf<
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

describe('success(x) still seeds E = never through a generic', () => {
  class Rejected extends Error {
    readonly reason = 'rejected' as const
  }
  const validate = (n: number): Result<string, Rejected> =>
    n > 0 ? success(String(n)) : failure(new Rejected())

  it('andThen and map take a bare success into a narrower Result', () => {
    const a: Result<string, Rejected> = andThen(validate, success(1))
    const b: Result<number, Rejected> = map((n: number) => n + 1, success(1))
    const c: Result<string, Rejected> = andThen(validate)(success(1))
    void [a, b, c]
  })

  it('a chain over a bare success keeps the exact error arm', () => {
    const r = andThen(validate, success(1))
    expectTypeOf(r).toEqualTypeOf<Result<string, Rejected>>()
    if (!isSuccess(r)) {
      expectTypeOf(r.reason).toEqualTypeOf<'rejected'>()
    }
  })

  it('an early return of a chain over a bare success needs no annotation', () => {
    const early = (n: number): Result<string, Rejected> => {
      const r = andThen(validate, success(n))
      if (isSuccess(r)) return r
      return r
    }
    void early
  })

  it('a function taking a Result infers E = never from a bare success', () => {
    const plain = <T, E extends Error = Error>(value: Result<T, E>): [T, E] => [
      value as T,
      undefined as unknown as E,
    ]
    expectTypeOf(plain(success(1))).toEqualTypeOf<[1, never]>()
  })
})

describe('success of a value that may be undefined, with no Failure arm, flows into a generic', () => {
  const plain = <T, E extends Error = Error>(value: Result<T, E>): [T, E] => [
    value as T,
    undefined as unknown as E,
  ]
  const orZero = (n: number | undefined): number => n ?? 0

  it('map seeds E = never and keeps the undefined for the callback', () => {
    expectTypeOf(map(orZero, success(opt))).toEqualTypeOf<
      Result<number, never>
    >()
  })

  it('a function taking a Result infers T with the undefined and E = never', () => {
    expectTypeOf(plain(success(opt))).toEqualTypeOf<
      [number | undefined, never]
    >()
  })

  it('a narrowed Success flows into map and the early return needs no annotation', () => {
    const early = (
      r: Result<number | undefined, Invalid>,
    ): Result<number, Invalid> => {
      if (isSuccess(r)) return map(orZero, r)
      return failure(r)
    }
    void early
  })

  it('Result.box takes it as a Result<number | undefined, never>', () => {
    const boxed = ResultBox.box(success(opt))
    expectTypeOf(boxed.unbox()).toEqualTypeOf<
      Result<number | undefined, never>
    >()
  })
})

describe('a nullish value now reaches a callback that cannot take it', () => {
  it('map and andThen over a Result<number | undefined, E> reject a (n: number) callback', () => {
    // @ts-expect-error - the undefined value reaches a callback that takes a number
    map((n: number) => n * 2, maybeNumber)
    // @ts-expect-error - the undefined value reaches a callback that takes a number
    andThen((n: number) => success(n), maybeNumber)
  })

  it('a callback that takes the undefined is accepted', () => {
    map((n: number | undefined) => (n ?? 0) * 2, maybeNumber)
    andThen((n: number | undefined) => success(n ?? 0), maybeNumber)
  })
})

describe('costs of a nullish arm that has no phantom', () => {
  it('Result<unknown, E> gets no nullish arm: success(undefined) no longer fits it', () => {
    // @ts-expect-error - unknown has no nullish arm to take the bare undefined
    const f = (): Result<unknown, Invalid> => success(undefined)
    // @ts-expect-error - unknown has no nullish arm to take the bare null
    const g = (): Result<unknown, Invalid> => success(null)
    void [f, g]
  })

  it('a chain over success(undefined) widens E to Error', () => {
    // @ts-expect-error - success(undefined) carries no E = never to seed the chain
    const c: Result<number, Invalid> = map(
      (_x: undefined) => 1,
      success(undefined),
    )
    expectTypeOf(map((_x: undefined) => 1, success(undefined))).toEqualTypeOf<
      Result<number, Error>
    >()
    void c
  })

  it('explicit type arguments on the combinator, a cast or result<T, E>() narrow E', () => {
    const validate = (_u: undefined): Result<string, Invalid> => success('x')
    const a: Result<number, Invalid> = map<
      undefined,
      number,
      undefined,
      Invalid
    >((_x) => 1, success(undefined))
    const b: Result<number, Invalid> = map(
      (_x: undefined) => 1,
      success(undefined) as Result<undefined, Invalid>,
    )
    const c: Result<number, Invalid> = map(
      (_x: undefined) => 1,
      result<undefined, Invalid>(undefined),
    )
    const d: Result<string, Invalid> = andThen(
      validate,
      result<undefined, Invalid>(undefined),
    )
    void [a, b, c, d]
  })

  it('success<undefined, E>(undefined), a declared seed and andThen(f, success(undefined)) do not narrow E', () => {
    const validate = (_u: undefined): Result<string, Invalid> => success('x')
    // @ts-expect-error - a nullish arm keeps no phantom, so E stays Error
    const a: Result<number, Invalid> = map(
      (_x: undefined) => 1,
      success<undefined, Invalid>(undefined),
    )
    // @ts-expect-error - E stays Error beside the callback's Invalid
    const b: Result<string, Invalid> = andThen(validate, success(undefined))
    const seed: Result<undefined, Invalid> = success(undefined)
    // @ts-expect-error - the declared type narrows to undefined on assignment
    const c: Result<number, Invalid> = map((_x: undefined) => 1, seed)
    // @ts-expect-error - the curried form infers E from the value too
    const d: Result<string, Invalid> = andThen(validate)(success(undefined))
    void [a, b, c, d]
  })
})

describe('a Success narrowed out of a Result<number | undefined, E> keeps its undefined through a generic', () => {
  const unwrap = <T, E extends Error>(x: Result<T, E>): T => {
    if (isFailure(x)) throw x
    return x
  }

  /* Regressed with the nullish arm (each compiled before it, on TypeScript 5.4
     and 5.9): `orElse` and `unwrap` on the narrowed arm, and `orElse` and
     `fallback` after ruling the `undefined` out of the whole Result. On 7.0
     the narrowed-arm `unwrap` already failed. Already errors on 0.4.0 and
     before the nullish arm, so not regressions: `fallback(() => 0, r)` on the
     narrowed arm (its callback was typed `never`), `unwrap` after ruling the
     `undefined` out of the whole Result, and the `string | null` case. */
  it('ruling the undefined out of the Success arm does not narrow T', () => {
    if (isSuccess(maybeNumber) && maybeNumber !== undefined) {
      // @ts-expect-error - T is read from the arm's number | undefined (regressed)
      const a: number = unwrap(maybeNumber)
      // @ts-expect-error - T is read from the arm's number | undefined (regressed)
      const b: number = orElse(0, maybeNumber)
      // @ts-expect-error - T is read from the arm's number | undefined (the callback was typed never before)
      const c: number = fallback(() => 0, maybeNumber)
      void [a, b, c]
    }
    if (isSuccess(maybeNumber) && typeof maybeNumber === 'number') {
      // @ts-expect-error - T is read from the arm's number | undefined (regressed)
      const d: number = unwrap(maybeNumber)
      void d
    }
    if (isSuccess(maybeNumber)) {
      // @ts-expect-error - the non-null assertion narrows the value, not the arm (regressed)
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- the assertion is the case under test
      const e: number = unwrap(maybeNumber!)
      void e
    }
    if (isSuccess(nullableString) && nullableString !== null) {
      // @ts-expect-error - T is read from the arm's string | null (an error before the nullish arm too)
      const f: string = unwrap(nullableString)
      void f
    }
  })

  it('so a narrowed arm widens back through mapError and box', () => {
    if (isSuccess(maybeNumber) && maybeNumber !== undefined) {
      const widened = mapError((e: Invalid) => e, maybeNumber)
      expectTypeOf<undefined>().toExtend<typeof widened>()
      void widened
      const boxed = ResultBox.box(maybeNumber).unbox()
      expectTypeOf<undefined>().toExtend<typeof boxed>()
      void boxed
    }
  })

  it('ruling undefined out of the whole Result first leaves the Failure arm at number | undefined', () => {
    if (maybeNumber !== undefined) {
      // @ts-expect-error - the Failure arm still carries number | undefined (regressed)
      const a: number = orElse(0, maybeNumber)
      // @ts-expect-error - the Failure arm still carries number | undefined (regressed)
      const b: number = fallback(() => 0, maybeNumber)
      // @ts-expect-error - the Failure arm still carries number | undefined (an error before the nullish arm too)
      const c: number = unwrap(maybeNumber)
      void [a, b, c]
    }
  })

  it('explicit type arguments and a declared Result<number, E> work', () => {
    if (isSuccess(maybeNumber) && maybeNumber !== undefined) {
      const a: number = orElse<number, Invalid>(0, maybeNumber)
      const rebound: Result<number, Invalid> = maybeNumber
      const b: number = orElse(0, rebound)
      void [a, b]
    }
    if (maybeNumber !== undefined) {
      const mapped = map((n: number) => n, maybeNumber)
      const c: number = orElse(0, mapped)
      void c
    }
  })
})

describe('the curried act family, a stub, does not take a Result<Maybe<T>, E> argument', () => {
  it('act with a Result<Maybe<number>, E> callback applies to a Maybe<number> but not to the Result', () => {
    act((_x: Result<Maybe<number>, Invalid>) => 1)(maybe)
    // @ts-expect-error - T and E infer from the value and the callback's parameter at once; handed to the act and Box work (#89)
    act((_x: Result<Maybe<number>, Invalid>) => 1)(mn)
  })
})
