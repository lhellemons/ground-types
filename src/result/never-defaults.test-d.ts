/* Type-level pins for the never defaults, the `success` guard, the `Success`
   marker and `result()`'s splitting overload (docs/adr/0001-unboxed-maybe-
   and-result.md, the 2026-11-14 amendment): the early returns that need no
   type arguments, both ADR 0001 guarantees, and every Breaking case. */
/* eslint-disable @typescript-eslint/no-empty-object-type -- `{}` is the point: the guard and the error arm must treat the empty object as a value an Error fits */
import { describe, expectTypeOf, it } from 'vitest'
import {
  catchOnly,
  failure,
  isFailure,
  isSuccess,
  result,
  success,
  tryCatch,
} from './index.js'
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

  it('failure() of a narrowed failure nests it in the error arm (phantom-intersection)', () => {
    const narrowed = null as unknown as Failure<number, Invalid>
    expectTypeOf(failure(narrowed)).toEqualTypeOf<
      Failure<never, Failure<number, Invalid>>
    >()
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

  it('result() of an unknown value keeps its Error arm, and of an any value stays any', () => {
    // `Extract<unknown, Error>` is `never`, which would collapse the Result
    // to its Success arm and let a caught plain Error pass where a narrower
    // class is required. The overload falls back to `Error` instead.
    const caught = null as unknown
    const take = (_r: Result<unknown, Invalid>): void => undefined
    const r = result(caught)
    expectTypeOf(r).toEqualTypeOf<Result<unknown, Error>>()
    // @ts-expect-error - Error is not Invalid
    take(r)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment -- `any` is the case under test
    const loose = null as any
    // `any` stays `any`, as it passes every constraint: nothing downstream
    // can be rejected for it, and nothing needs it to keep an Error arm.
    expectTypeOf(result(loose)).toBeAny()
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

  it('a plain Error is rejected where T admits an object', () => {
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

  it('result() of an object type that can hide an Error subclass keeps an Error arm', () => {
    // `Other` is assignable to `{ code: string }`, so a value of that type
    // may be an Error at runtime; the arm must say so, as on 0.4.0.
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
    expectTypeOf(result(true as boolean)).toEqualTypeOf<
      Result<boolean, never>
    >()
    expectTypeOf(result(1n as bigint)).toEqualTypeOf<Result<bigint, never>>()
    expectTypeOf(result(Symbol('s'))).toEqualTypeOf<Result<symbol, never>>()
  })

  it('success() rejects a value whose type may hold an Error', () => {
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
    // A union of such a type with a primitive, null or undefined is still
    // such a type, and a plain Error fits { message }.
    const g = (x: object | undefined): Result<object | undefined, Invalid> =>
      // @ts-expect-error - may be an Error
      success(x)
    const h = (
      x: { id?: string } | undefined,
    ): Result<{ id?: string } | undefined, Invalid> =>
      // @ts-expect-error - may be an Error
      success(x)
    const i = (x: string | object): Result<string | object, Invalid> =>
      // @ts-expect-error - may be an Error
      success(x)
    const j = (x: {} | null): Result<{} | null, Invalid> =>
      // @ts-expect-error - may be an Error
      success(x)
    const k = (
      x: Record<string, unknown> | undefined,
    ): Result<Record<string, unknown> | undefined, Invalid> =>
      // @ts-expect-error - may be an Error
      success(x)
    const l = (
      x: { stack?: string } | number,
    ): Result<{ stack?: string } | number, Invalid> =>
      // @ts-expect-error - may be an Error
      success(x)
    const m = (x: { message: string }): Result<{ message: string }, Invalid> =>
      // @ts-expect-error - a plain Error fits { message: string }
      success(x)
    // …while a union whose object member a plain Error does not fit passes.
    const n = (
      x: { id: string } | undefined,
    ): Result<{ id: string } | undefined, Invalid> => success(x)
    void [a, b, c, d, e, f, g, h, i, j, k, l, m, n]
    expectTypeOf<
      NotPossiblyAnError<unknown>
    >().toEqualTypeOf<'This value may be an Error — wrap it with result(), not success()'>()
  })

  it('success() of an unresolved type parameter, or an explicit unknown, no longer compiles (Breaking)', () => {
    // An unresolved `T` cannot be judged; both compiled on 0.4.0.
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment -- `any` is the case under test
    const loose = null as any
    success(loose)
    // The guard judges the value's type at any site, not only at a site
    // typed to a narrower error class.
    interface Config {
      a: string
      b: number
    }
    // @ts-expect-error - Breaking: an all-optional object, whatever the target
    const w3 = (p: Partial<Config>): Result<Partial<Config>> => success(p)
    // @ts-expect-error - Breaking: no target at all
    const w4 = (p: Partial<Config>) => success(p)
    // @ts-expect-error - Breaking: explicit type arguments do not bypass the guard
    const w5 = (p: Partial<Config>) => success<Partial<Config>, Error>(p)
    void [w, w2, w3, w4, w5]
    // Breaking too: failure's one-argument form and result's one-argument
    // form change their inferred phantom and error arm.
    expectTypeOf(failure<Invalid>(new Invalid('x'))).toEqualTypeOf<
      Failure<never, Invalid>
    >()
    expectTypeOf(result<number>(5)).toEqualTypeOf<Result<number, never>>()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment -- `any` is the case under test
    const anyValue = null as any
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- `any` is the case under test
    expectTypeOf(result<number>(anyValue)).toEqualTypeOf<
      Result<number, never>
    >()
    const nx = null as unknown as number | Invalid
    expectTypeOf(result<number | Invalid>(nx)).toEqualTypeOf<
      Result<number, Invalid>
    >()
  })

  it('result() of a nested Result flattens for primitive values and stays nested for objects', () => {
    class Game {
      constructor(readonly id: string) {}
    }
    const nested = null as unknown as Result<Result<number, Invalid>, Invalid>
    // The conservative arm drops Error for a primitive Success value, so
    // the overload's output fits the flat Result; 0.4.0 rejects this.
    const flat: Result<number, Invalid> = result(nested)
    void flat
    const nestedObj = null as unknown as Result<Result<Game, Invalid>, Invalid>
    // @ts-expect-error - an object value keeps Error in the arm
    const flatObj: Result<Game, Invalid> = result(nestedObj)
    void flatObj
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

  it("Success's phantom E is covariant, on 0.4.0 and now", () => {
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

  it('a handler written with failure() or result() infers E too (fails on 0.4.0)', () => {
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

describe('what the success guard also rejects, beyond the may-be-an-Error unions', () => {
  it('rejects a class a plain Error fits structurally', () => {
    class Tag {
      constructor(readonly name: string) {}
    }
    const a = (t: Tag): Result<Tag, Invalid> =>
      // @ts-expect-error - Breaking: a plain Error has a `name: string`, so it fits Tag
      success(t)
    const b = (t: { name: string }): Result<{ name: string }, Invalid> =>
      // @ts-expect-error - Breaking: the same for the bare shape
      success(t)
    // …while the same class with a member no Error has passes.
    class Label {
      constructor(
        readonly name: string,
        readonly colour: string,
      ) {}
    }
    const c = (l: Label): Result<Label, Invalid> => success(l)
    void [a, b, c]
  })

  it('rejects an index-signature type: dictionaries and JSON types', () => {
    // The empty object fits an index signature, so the guard cannot tell it
    // from an Error. Breaking.
    const a = (d: Record<string, number>): Result<Record<string, number>> =>
      // @ts-expect-error - Breaking: Record<string, number>
      success(d)
    const b = (d: { [key: string]: unknown }) =>
      // @ts-expect-error - Breaking: a dictionary of unknowns
      success(d)
    void [a, b]
  })
})

describe('a variable seeded by an unannotated constructor call keeps the narrower type', () => {
  it('rejects a later wider assignment (Breaking)', () => {
    const wider = null as unknown as Failure<number, Invalid>
    // `failure(e)` is now `Failure<never, Invalid>`, not `Failure<unknown, Invalid>`.
    let last = failure(new Invalid('x'))
    expectTypeOf(last).toEqualTypeOf<Failure<never, Invalid>>()
    // @ts-expect-error - Breaking: annotate the variable, or seed it with failure<Invalid, number>
    last = wider
    // `result(primitive)` seeds a Result with no error arm at all.
    let seeded = result(5 as number)
    expectTypeOf(seeded).toEqualTypeOf<Result<number, never>>()
    // @ts-expect-error - Breaking: the seed has no error arm; 0.4.0 took this
    seeded = null as unknown as Failure<number, Invalid>
    const n = 1 as number
    let s = success(n)
    expectTypeOf(s).toEqualTypeOf<Success<number, never>>()
    // @ts-expect-error - Breaking: the seed carries no error; 0.4.0 took this
    s = null as unknown as Success<number, Invalid>
    // Annotated, both are fine.
    let ok: Result<number, Invalid> = failure(new Invalid('x'))
    void ok
    ok = success(1)
    void [last, seeded, s, ok]
  })
})

describe('catchOnly and the tryCatch class list keep their error type under the new defaults', () => {
  it('catchOnly returns a Failure<never, …> that tryCatch takes as a handler', () => {
    const handler = catchOnly(Invalid, Other)
    expectTypeOf(handler).toEqualTypeOf<
      (error: unknown) => Failure<never, Invalid | Other>
    >()
    const lifted = tryCatch((n: number) => n * 2, handler)
    expectTypeOf(lifted).toEqualTypeOf<
      (n: number) => Result<number, Invalid | Other>
    >()
    const take = (_r: Result<number, Invalid | Other>): void => undefined
    take(lifted(1))
  })

  it('the class-list shorthand infers the same Result', () => {
    const lifted = tryCatch((n: number) => n * 2, [Invalid, Other])
    expectTypeOf(lifted).toEqualTypeOf<
      (n: number) => Result<number, Invalid | Other>
    >()
    // @ts-expect-error - a plain Error is not one of the listed classes
    const narrow: Result<number, Invalid> = lifted(1)
    void narrow
  })
})
