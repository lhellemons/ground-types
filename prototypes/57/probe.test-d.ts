/* PROTOTYPE #57 — throwaway probe, not part of the library.
   Copied into src/result/ by prototypes/57/run.sh for one measurement and
   removed again. Scenarios every arm must satisfy. */
import { describe, expectTypeOf, it } from 'vitest'
import { failure, isFailure, isSuccess, result, success } from './index.js'
import type { Failure, Result, Success } from './index.js'
import { definePrimitiveValueObject } from '../value-object/index.js'
import type { Branded } from '../brand/index.js'

class Invalid extends Error {
  readonly code = 'invalid' as const
}
class Other extends Error {
  readonly code = 'other' as const
}

declare function step(): Result<number, Invalid>

describe('early returns without type arguments', () => {
  it('success() at a site typed to a narrower error class', () => {
    const f = (n: number): Result<number, Invalid> => success(n)
    expectTypeOf(f).returns.toEqualTypeOf<Result<number, Invalid>>()
  })

  it('failure() at a site typed to an error union', () => {
    const f = (): Result<number, Invalid | Other> => failure(new Invalid('x'))
    expectTypeOf(f).returns.toEqualTypeOf<Result<number, Invalid | Other>>()
  })

  it('result() at a site typed to a narrower error class', () => {
    const f = (x: number | Invalid): Result<number, Invalid> => result(x)
    expectTypeOf(f).returns.toEqualTypeOf<Result<number, Invalid>>()
  })

  it('re-wrapping a narrowed failure into a Result with a different T', () => {
    const f = (): Result<string, Invalid | Other> => {
      const r = step()
      if (isFailure(r)) return failure(r)
      return success(String(r))
    }
    expectTypeOf(f).returns.toEqualTypeOf<Result<string, Invalid | Other>>()
  })

  it('the narrowed success is usable as the value', () => {
    const r = step()
    if (isSuccess(r)) {
      expectTypeOf(r).toExtend<number>()
    }
  })
})

describe('ADR 0001 safety properties', () => {
  it('rejects a plain Error where a narrower error class is expected', () => {
    // @ts-expect-error - Error is not Invalid
    const f = (): Result<number, Invalid> => failure(new Error('x'))
    void f
    // @ts-expect-error - Error is not Invalid
    const g = (x: number | Error): Result<number, Invalid> => result(x)
    void g
  })

  it('result() of an unknown or any value keeps its Error arm', () => {
    // `Extract<unknown, Error>` is `never`, which would collapse the Result
    // to its Success arm and let a caught plain Error pass where a narrower
    // class is required. The overload falls back to `Error` instead.
    const caught = null as unknown
    const take = (_r: Result<unknown, Invalid>): void => undefined
    const r = result(caught)
    expectTypeOf(r).toEqualTypeOf<Result<unknown, Error>>()
    // @ts-expect-error - Error is not Invalid
    take(r)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const loose = null as any
    // `any` keeps its Error arm too; its Success arm is `any`, as on main,
    // so nothing downstream can be rejected for it.
    expectTypeOf(result(loose)).toEqualTypeOf<Result<any, Error>>()
  })

  it('rejects a plain Failure<_, Error> where Failure<_, Invalid> is expected', () => {
    const plain = null as unknown as Failure<number, Error>
    // @ts-expect-error - Error is not Invalid
    const narrow: Failure<number, Invalid> = plain
    void narrow
  })

  it('Result<Result<T>> is not assignable to Result<T>', () => {
    const nested = null as unknown as Result<Result<number>>
    // @ts-expect-error - a Result cannot nest
    const flat: Result<number> = nested
    void flat
    const nestedNarrow = null as unknown as Result<
      Result<number, Invalid>,
      Invalid
    >
    // @ts-expect-error - a Result cannot nest
    const flatNarrow: Result<number, Invalid> = nestedNarrow
    void flatNarrow
  })

  it("Success's phantom E is covariant, on main and under every arm", () => {
    // What the 2026-08-04 amendment called invariance: only the widening
    // direction was ever allowed, and the narrowing one is what cost the
    // annotation when the default was `Error`.
    const narrow = null as unknown as Success<number, Invalid>
    const wide: Success<number, Error> = narrow
    void wide
    const plain = null as unknown as Success<number, Error>
    // @ts-expect-error - Error is not Invalid
    const narrowed: Success<number, Invalid> = plain
    void narrowed
  })

  it('Success<T, never> is assignable to any Result<T, E> — it carries no error', () => {
    const sure = null as unknown as Success<number, never>
    const r: Result<number, Invalid> = sure
    void r
  })
})

describe('definePrimitiveValueObject', () => {
  type Email = Branded<string, 'Email'>
  class InvalidEmail extends Error {
    readonly code = 'invalid-email' as const
  }
  it('with T named, E takes its default: partial type arguments are never inferred', () => {
    const Email = definePrimitiveValueObject<Email>(
      (value) => value as Email,
      () => new InvalidEmail('x'),
    )
    expectTypeOf(Email.from).returns.toEqualTypeOf<Result<Email, Error>>()
  })

  it('with no type arguments at all, T, P and E all infer', () => {
    const Email = definePrimitiveValueObject(
      (value: string) => value as Email,
      () => new InvalidEmail('x'),
    )
    expectTypeOf(Email.from).returns.toEqualTypeOf<
      Result<Email, InvalidEmail>
    >()
  })
})
