/* PROTOTYPE #57 — throwaway probe, not part of the library.
   Copied into src/result/ by prototypes/57/run.sh for one measurement and
   removed again. Scenarios every arm must satisfy. */
import { describe, expectTypeOf, it } from 'vitest'
import { failure, isFailure, isSuccess, result, success } from './index.js'
import type { Failure, NotPossiblyAnError, Result, Success } from './index.js'
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

  it('result() of a supertype of Error keeps its Error arm', () => {
    // `Extract<object, Error>` is `never` too: every type an Error is
    // assignable to, without being one, needs the same fallback.
    const take = (_r: Result<unknown, Invalid>): void => undefined
    const o = null as unknown as object
    expectTypeOf(result(o)).toEqualTypeOf<Result<object, Error>>()
    // @ts-expect-error - Error is not Invalid
    take(result(o))
    const empty = null as unknown as {}
    expectTypeOf(result(empty)).toEqualTypeOf<Result<{}, Error>>()
    const shaped = null as unknown as { message: string }
    expectTypeOf(result(shaped)).toEqualTypeOf<
      Result<{ message: string }, Error>
    >()
    try {
      throw new Error('x')
    } catch (e) {
      if (typeof e === 'object' && e !== null) {
        // @ts-expect-error - Error is not Invalid
        take(result(e))
      }
    }
    // An Error itself has no Success arm left.
    expectTypeOf(result(new Error('x'))).toEqualTypeOf<Failure<never, Error>>()
    // A union keeps each Error member as itself.
    const u = null as unknown as number | Invalid | Other
    expectTypeOf(result(u)).toEqualTypeOf<Result<number, Invalid | Other>>()
  })

  it('a plain Error is rejected where T admits an object (review round 3)', () => {
    // With `failure`'s `T` defaulting to `never`, `Failure<never, Error>`
    // would fit `Success<unknown, Invalid>` structurally: its phantom
    // `never` passes and an Error object satisfies `unknown`. `Success`
    // carries `[_error]?: never`, which no Failure can satisfy.
    // @ts-expect-error - Error is not Invalid
    const a = (): Result<unknown, Invalid> => failure(new Error('x'))
    // @ts-expect-error - Error is not Invalid
    const b = (): Result<object, Invalid> => failure(new Error('x'))
    // @ts-expect-error - Error is not Invalid
    const c = (): Result<{}, Invalid> => failure(new Error('x'))
    // @ts-expect-error - Error is not Invalid
    const d = (): Result<{ id?: string }, Invalid> => failure(new Error('x'))
    // @ts-expect-error - Error is not Invalid
    const e = (err: Error): Result<unknown, Invalid> => result(err)
    const take = (_r: Result<unknown, Invalid>): void => undefined
    const x = null as unknown as Error | Invalid
    // @ts-expect-error - Error is not Invalid
    take(result(x))
    void [a, b, c, d, e]
  })

  it('result() of an object type that can hide an Error subclass keeps an Error arm (review round 4)', () => {
    // `Other` is assignable to `{ code: string }`, so a value of that type
    // may be an Error at runtime; the arm must say so, as on main.
    const hidden: { code: string } = new Other('x')
    expectTypeOf(result(hidden)).toEqualTypeOf<
      Result<{ code: string }, Error>
    >()
    // @ts-expect-error - Error is not Invalid
    const accepted: Result<{ code: string }, Invalid> = result(hidden)
    void accepted
    // A primitive, branded or not, provably holds no Error.
    const email = '' as Branded<string, 'Email'>
    expectTypeOf(result(email)).toEqualTypeOf<
      Result<Branded<string, 'Email'>, never>
    >()
    expectTypeOf(result(5 as number)).toEqualTypeOf<Result<number, never>>()
    expectTypeOf(result(null)).toEqualTypeOf<Result<null, never>>()
  })

  it('success() rejects a value whose type may hold an Error (review round 4, part 2)', () => {
    // With `E = never`, each of these would otherwise flow into a Result
    // typed to Invalid while holding an Error at runtime.
    const caught = null as unknown
    // @ts-expect-error - may be an Error: wrap it with result()
    const a = (): Result<unknown, Invalid> => success(caught)
    const o = null as unknown as object
    // @ts-expect-error - may be an Error
    const b = (): Result<object, Invalid> => success(o)
    const x = null as unknown as number | Error
    // @ts-expect-error - may be an Error
    const c = (): Result<unknown, Invalid> => success(x)
    const ro = null as unknown as Result<number, Other>
    // @ts-expect-error - may be an Error (and would nest a Result)
    const d = (): Result<number, Invalid> => success(ro)
    // @ts-expect-error - may be an Error
    const e = (): Result<number, Invalid> => success(result(x))
    const opt = null as unknown as { id?: string }
    // @ts-expect-error - may be an Error: an all-optional object admits one
    const f = (): Result<{ id?: string }, Invalid> => success(opt)
    void [a, b, c, d, e, f]
    expectTypeOf<
      NotPossiblyAnError<unknown>
    >().toEqualTypeOf<'This value may be an Error — wrap it with result(), not success()'>()
  })

  it('success() of an unresolved type parameter, or an explicit unknown, no longer compiles (Breaking, review round 5)', () => {
    // An unresolved `T` cannot be judged; both compiled on main.
    function w<T>(x: T): Result<T> {
      // @ts-expect-error - T may be an Error: cast, or wrap with result()
      return success(x)
    }
    function w2<T extends { id: string }>(x: T): Result<T, Invalid> {
      // @ts-expect-error - T may be an Error, constrained or not, type arguments or not
      return success<T, Invalid>(x)
    }
    const caught = null as unknown
    // @ts-expect-error - unknown may be an Error
    success<unknown>(caught)
    // `any` passes, as it passes every constraint.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const loose = null as any
    success(loose)
    void [w, w2]
  })

  it('success() stays annotation-free for domain objects, arrays, DTOs and primitives', () => {
    class Game {
      constructor(
        readonly id: string,
        readonly round: number,
      ) {}
    }
    const g = (game: Game): Result<Game, Invalid> => success(game)
    const h = (xs: readonly Game[]): Result<readonly Game[], Invalid> =>
      success(xs)
    const i = (dto: { id: string }): Result<{ id: string }, Invalid> =>
      success(dto)
    const j = (): Result<void, Invalid> => success(undefined)
    expectTypeOf(g).returns.toEqualTypeOf<Result<Game, Invalid>>()
    void [h, i, j]
    // The residual: any object type some Error subclass fits structurally
    // cannot be told from a safe object — a plain interface, a DTO, a class
    // instance without private members. Known sharp edge, on record.
    const hidden: { code: string } = new Other('x')
    const k = (): Result<{ code: string }, Invalid> => success(hidden)
    class Sneaky extends Error {
      readonly id = 'x'
      readonly round = 1
    }
    const sneaky: Game = new Sneaky()
    const l = (): Result<Game, Invalid> => success(sneaky)
    void [k, l]
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

  it('a handler written with failure() or result() infers E too (fails on main)', () => {
    const E2 = definePrimitiveValueObject(
      (value: string) => value as Email,
      () => failure(new InvalidEmail('x')),
    )
    expectTypeOf(E2.from).returns.toEqualTypeOf<Result<Email, InvalidEmail>>()
    const E3 = definePrimitiveValueObject(
      (value: string) => value as Email,
      (e) =>
        result(e instanceof InvalidEmail ? e : new InvalidEmail(String(e))),
    )
    expectTypeOf(E3.from).returns.toEqualTypeOf<Result<Email, InvalidEmail>>()
  })
})
