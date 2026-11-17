/* PROTOTYPE #117 — throwaway type probes: where the guards bite, how a
   Maybe part reads, what each form infers. ADR 0006 cites these by title. */
import { describe, expectTypeOf, it } from 'vitest'
import type { Result } from '../../src/result/index.js'
import { map as mapResult, orElse, success } from '../../src/result/index.js'
import type { Success } from '../../src/result/index.js'
import { pipe } from '../../src/fn/index.js'
import type { Maybe } from '../../src/maybe/index.js'
import { just, maybe } from '../../src/maybe/index.js'
import {
  andThen,
  bestEffort,
  gather,
  map,
  note,
  recover,
  recoverWith,
  toResult,
  toResultUnguarded,
} from './best-effort.js'
import type { BestEffort, NotABestEffort } from './best-effort.js'
import type { NotPossiblyAnError } from '../../src/result/index.js'
import { readOpenWhen, World, WorldFormatErrors } from './consumer.js'
import type { Diagnostic, WorldFormatError } from './consumer.js'

const toErrors = (d: readonly Diagnostic[]) => new WorldFormatErrors(d)
declare const world: World
declare const diag: Diagnostic

describe('the guards', () => {
  it('toResult carries NotPossiblyAnError on T: an Error, an all-optional object, an index signature and an unresolved T are refused', () => {
    // @ts-expect-error an Error-typed value would read as a Failure
    toResult(toErrors, bestEffort(new Error('x')))
    const allOptional: BestEffort<{ a?: number }, Diagnostic> = bestEffort({})
    // @ts-expect-error an all-optional object admits an Error
    toResult(toErrors, allOptional)
    const indexed: BestEffort<Record<string, number>, Diagnostic> = bestEffort(
      {},
    )
    // @ts-expect-error an index-signature type admits an Error
    toResult(toErrors, indexed)
    function generic<T>(be: BestEffort<T, Diagnostic>) {
      // @ts-expect-error an unresolved T is refused, as success refuses it
      return toResult(toErrors, be)
    }
    void generic
    expectTypeOf(toResult(toErrors, bestEffort(world))).toEqualTypeOf<
      Result<World, WorldFormatErrors>
    >()
  })
  it('toResultUnguarded admits all of them through its cast, as orElse and fromMaybe do', () => {
    toResultUnguarded(toErrors, bestEffort(new Error('x')))
    const allOptional: BestEffort<{ a?: number }, Diagnostic> = bestEffort({})
    toResultUnguarded(toErrors, allOptional)
    const indexed: BestEffort<Record<string, number>, Diagnostic> = bestEffort(
      {},
    )
    toResultUnguarded(toErrors, indexed)
    function generic<T>(be: BestEffort<T, Diagnostic>) {
      return toResultUnguarded(toErrors, be)
    }
    expectTypeOf(generic<World>).returns.toEqualTypeOf<
      Result<World, WorldFormatErrors>
    >()
  })
  it('a nested BestEffort is refused: map to a BestEffort, toResult of a BestEffort, and a union with one', () => {
    // @ts-expect-error the callback returns a BestEffort: use andThen
    map((x: number) => bestEffort(x, ['lost']), bestEffort(1))
    // @ts-expect-error a union with a BestEffort arm is refused too
    map((x: number) => (x > 0 ? bestEffort(x) : x), bestEffort(1))
    // @ts-expect-error a BestEffort-valued T would carry its list out as a Success
    toResult(toErrors, bestEffort(bestEffort(1, ['lost'])))
    const union: BestEffort<BestEffort<number, string> | number, Diagnostic> =
      bestEffort(1)
    // @ts-expect-error a union with a BestEffort arm is refused too
    toResult(toErrors, union)
    // @ts-expect-error the curried toResult refuses it at application
    toResult(toErrors)(bestEffort(bestEffort(1, ['lost'])))
    const ofMaybe: BestEffort<
      Maybe<BestEffort<number, string>>,
      Diagnostic
    > = bestEffort(undefined)
    // @ts-expect-error a Maybe of a box has the box as a top-level arm
    toResult(toErrors, ofMaybe)
    const orList: BestEffort<
      BestEffort<number, string> | BestEffort<number, string>[],
      Diagnostic
    > = bestEffort([])
    // @ts-expect-error a box or a list of boxes has the box as a top-level arm
    toResult(toErrors, orList)
  })
  it('a Best Effort inside a container is not refused: an array, a tuple, an object property, a Promise, and a declared return { readonly value: number } or { value?: number; diagnostics: readonly string[] } pass map and toResult, and a gather of nested boxes passes toResult', () => {
    const toE = (d: readonly unknown[]) => new Error(String(d.length))
    expectTypeOf(
      toResult(
        toE,
        map((x: number) => [bestEffort(x, ['lost'])] as const, bestEffort(1)),
      ),
    ).toEqualTypeOf<Result<readonly [BestEffort<number, string>], Error>>()
    expectTypeOf(
      toResult(
        toE,
        map(
          (x: number) => Promise.resolve(bestEffort(x, ['lost'])),
          bestEffort(1),
        ),
      ),
    ).toEqualTypeOf<Result<Promise<BestEffort<number, string>>, Error>>()
    expectTypeOf(
      toResult(
        toE,
        map((x: number) => [bestEffort(x, ['lost'])], bestEffort(1)),
      ),
    ).toEqualTypeOf<Result<BestEffort<number, string>[], Error>>()
    expectTypeOf(
      toResult(
        toE,
        map((x: number) => ({ inner: bestEffort(x, ['lost']) }), bestEffort(1)),
      ),
    ).toEqualTypeOf<Result<{ inner: BestEffort<number, string> }, Error>>()
    expectTypeOf(
      toResult(toE, gather([bestEffort(bestEffort(1, ['lost']))])),
    ).toEqualTypeOf<Result<readonly BestEffort<number, string>[], Error>>()
    expectTypeOf(
      toResult(
        toE,
        map(
          (x: number): { readonly value: number } => bestEffort(x, ['lost']),
          bestEffort(1),
        ),
      ),
    ).toEqualTypeOf<Result<{ readonly value: number }, Error>>()
    expectTypeOf(
      toResult(
        toE,
        map(
          (x: number): { value?: number; diagnostics: readonly string[] } =>
            bestEffort(x, ['lost']),
          bestEffort(1),
        ),
      ),
    ).toEqualTypeOf<
      Result<{ value?: number; diagnostics: readonly string[] }, Error>
    >()
  })
  it("a look-alike is refused: an arm assignable to BestEffort<unknown, unknown> reads as a Best Effort (a public required value and a required diagnostics that readonly unknown[] accepts, any included), a private value does not, and a generic map callback is refused as /result's is", () => {
    const toE = (d: readonly unknown[]) => new Error(String(d.length))
    const rep = { value: 's', diagnostics: ['d'], file: 'f' }
    // @ts-expect-error structurally a BestEffort
    map(() => rep, bestEffort(1))
    // @ts-expect-error structurally a BestEffort
    toResult(toE, bestEffort(rep))
    const anyList: { value: number; diagnostics: any } = {
      value: 1,
      diagnostics: 0,
    }
    // @ts-expect-error a diagnostics typed any is accepted by readonly unknown[]
    map(() => anyList, bestEffort(1))
    // @ts-expect-error a diagnostics typed any is accepted by readonly unknown[]
    toResult(toE, bestEffort(anyList))
    class Hidden {
      private readonly value = 1
      readonly diagnostics: readonly string[] = ['d']
      get sum() {
        return this.value
      }
    }
    expectTypeOf(
      toResult(
        toE,
        map(() => new Hidden(), bestEffort(1)),
      ),
    ).toEqualTypeOf<Result<Hidden, Error>>()
    function generic<V>(f: (n: number) => V, be: BestEffort<number, never>) {
      // @ts-expect-error an unresolved V may be a BestEffort
      return map(f, be)
    }
    function genericResult<V>(f: (n: number) => V, r: Result<number, Error>) {
      // @ts-expect-error /result's map refuses an unresolved V the same way
      return mapResult(f, r)
    }
    void [generic, genericResult]
    expectTypeOf<
      NotABestEffort<BestEffort<number, string>>
    >().toEqualTypeOf<'This value is a BestEffort — use andThen, not map, and toResult only on the inner value'>()
    expectTypeOf<NotABestEffort<number>>().toEqualTypeOf<unknown>()
  })
  it("toResult refuses a T of any: the two guards together, with no fix named, applied and curried; map's guard passes any", () => {
    const toE = (d: readonly unknown[]) => new Error(String(d.length))
    const ofAny = bestEffort(JSON.parse('1'))
    // @ts-expect-error any passes each guard alone and fails their intersection
    toResult(toE, ofAny)
    // @ts-expect-error any passes each guard alone and fails their intersection
    toResult(toE)(ofAny)
    expectTypeOf(map((): any => JSON.parse('1'), bestEffort(1))).toEqualTypeOf<
      BestEffort<any, never>
    >()
  })
  it('the curried forms carry the guards: toResult(toError) refuses an Error-typed box, map(fn) refuses a callback returning a box', () => {
    // @ts-expect-error the unapplied toResult carries NotPossiblyAnError
    toResult(toErrors)(bestEffort(new Error('x')))
    // @ts-expect-error the unapplied map carries NotABestEffort
    map((x: number) => bestEffort(x, ['l']))
  })
  it("the constructor, map's return and the fallback of recover and recoverWith admit an Error: the box keeps value and diagnostics apart", () => {
    expectTypeOf(bestEffort(new Error('x'))).toEqualTypeOf<
      BestEffort<Error, never>
    >()
    expectTypeOf(map((): Error => new Error('x'), bestEffort(1))).toEqualTypeOf<
      BestEffort<Error, never>
    >()
    const r: Result<Error, RangeError> = new RangeError('x') as Result<
      Error,
      RangeError
    >
    expectTypeOf(recover(new Error('fallback'), r)).toEqualTypeOf<
      BestEffort<Error, RangeError>
    >()
    expectTypeOf(
      recoverWith(new Error('fb'), (e: RangeError) => e.message, r),
    ).toEqualTypeOf<BestEffort<Error, string>>()
    function generic<T>(result: Result<T, RangeError>, fallback: T) {
      return recover(fallback, result)
    }
    expectTypeOf(generic<number>).returns.toEqualTypeOf<
      BestEffort<number, RangeError>
    >()
  })
})

describe('a Maybe part', () => {
  it('readOpenWhen is BestEffort<Maybe<string>, WorldFormatError>, and an un-annotated bestEffort(undefined) fits it', () => {
    expectTypeOf(readOpenWhen).returns.toEqualTypeOf<
      BestEffort<Maybe<string>, WorldFormatError>
    >()
    const absent: BestEffort<Maybe<string>, WorldFormatError> = bestEffort(
      undefined,
    )
    void absent
  })
  it('toResult of a Maybe part is a Result of a Maybe', () => {
    expectTypeOf(
      toResult(toErrors, readOpenWhen(undefined, 'b', [], 0)),
    ).toEqualTypeOf<Result<Maybe<string>, WorldFormatErrors>>()
  })
  it('a generic reader over `value: T | undefined` cannot return bestEffort(value) as BestEffort<Maybe<T>, D>; maybe(value), just(value) and a Maybe<T> parameter need no cast', () => {
    function plain<T>(value: T | undefined): BestEffort<Maybe<T>, never> {
      // @ts-expect-error Maybe<T> does not reduce for an unresolved T
      return bestEffort(value)
    }
    function viaMaybe<T>(value: T | undefined): BestEffort<Maybe<T>, never> {
      return bestEffort(maybe(value))
    }
    function viaJust<T>(value: T): BestEffort<Maybe<T>, never> {
      return bestEffort<Maybe<T>>(just(value))
    }
    function overMaybe<T>(value: Maybe<T>): BestEffort<Maybe<T>, never> {
      return bestEffort(value)
    }
    void [plain, viaMaybe, viaJust, overMaybe]
  })
  it('recover with an undefined fallback over a Result<T, E> infers BestEffort<T | undefined, E> in the applied form; the curried form binds T to undefined and needs the type argument', () => {
    const r: Result<World, RangeError> = success(world)
    expectTypeOf(recover(undefined, r)).toEqualTypeOf<
      BestEffort<World | undefined, RangeError>
    >()
    expectTypeOf(
      recoverWith(undefined, (e: RangeError) => e.message, r),
    ).toEqualTypeOf<BestEffort<World | undefined, string>>()
    // @ts-expect-error the unapplied recover(undefined) is a Mapper over Result<undefined, E>
    recover(undefined)(r)
    expectTypeOf(recover<Maybe<World>>(undefined)(r)).toEqualTypeOf<
      BestEffort<Maybe<World>, RangeError>
    >()
  })
})

describe('inference', () => {
  it('D defaults to never and is not inferred from the value, so a clean value flows anywhere', () => {
    expectTypeOf(bestEffort(1)).toEqualTypeOf<BestEffort<number, never>>()
    const target: BestEffort<number, Diagnostic> = bestEffort(1)
    void target
    expectTypeOf(bestEffort(1, [diag])).toEqualTypeOf<
      BestEffort<number, Diagnostic>
    >()
  })
  it('an un-annotated callback parameter is unknown in map and andThen, applied or curried, over a constructor, a note, a gather, a map and an andThen: the parameter comes from the callback alone', () => {
    map((x) => {
      expectTypeOf(x).toEqualTypeOf<unknown>()
      return x
    }, bestEffort(1))
    map(
      (x) => {
        expectTypeOf(x).toEqualTypeOf<unknown>()
        return x
      },
      note([diag], bestEffort(1)),
    )
    map(
      (x) => {
        expectTypeOf(x).toEqualTypeOf<unknown>()
        return x
      },
      gather([bestEffort(1)]),
    )
    map(
      (x) => {
        expectTypeOf(x).toEqualTypeOf<unknown>()
        return x
      },
      map((p: number) => String(p), bestEffort(1)),
    )
    map(
      (x) => {
        expectTypeOf(x).toEqualTypeOf<unknown>()
        return x
      },
      andThen((p: number) => bestEffort(String(p)), bestEffort(1)),
    )
    andThen((x) => {
      expectTypeOf(x).toEqualTypeOf<unknown>()
      return bestEffort(x)
    }, bestEffort(1))
    map((x) => {
      expectTypeOf(x).toEqualTypeOf<unknown>()
      return x
    })(bestEffort(1))
    mapResult((x) => {
      expectTypeOf(x).toEqualTypeOf<unknown>()
      return x
    }, success(1))
  })
  it('an annotated callback types the result in both forms, and the curried form binds D at application', () => {
    expectTypeOf(map((x: number) => String(x), bestEffort(1))).toEqualTypeOf<
      BestEffort<string, never>
    >()
    expectTypeOf(
      map((x: number) => String(x), bestEffort(1, [diag])),
    ).toEqualTypeOf<BestEffort<string, Diagnostic>>()
    expectTypeOf(
      map((x: number) => String(x))(bestEffort(1, [diag])),
    ).toEqualTypeOf<BestEffort<string, Diagnostic>>()
    // @ts-expect-error the curried map rejects a value whose T does not fit the callback
    map((x: number) => String(x))(bestEffort('s'))
  })
  it('andThen unions the diagnostic types and takes the value of the second step, applied and curried', () => {
    const first = bestEffort(1, [diag])
    expectTypeOf(
      andThen((x: number) => bestEffort(String(x), ['s']), first),
    ).toEqualTypeOf<BestEffort<string, Diagnostic | string>>()
    expectTypeOf(
      andThen((x: number) => bestEffort(String(x), ['s']))(first),
    ).toEqualTypeOf<BestEffort<string, Diagnostic | string>>()
  })
  it("note unions its D with the value's, applied and curried", () => {
    expectTypeOf(note([diag], bestEffort(1))).toEqualTypeOf<
      BestEffort<number, Diagnostic>
    >()
    expectTypeOf(note([diag], bestEffort(1, ['s']))).toEqualTypeOf<
      BestEffort<number, Diagnostic | string>
    >()
    expectTypeOf(note([diag])(bestEffort(1, ['s']))).toEqualTypeOf<
      BestEffort<number, Diagnostic | string>
    >()
  })
  it('toResult reads D from the value into toError in the applied form and E from toError; the unapplied toResult(toError) binds D and E at the call and T at application; in pipe an un-annotated toError reads D from the piped box', () => {
    toResult((d) => {
      expectTypeOf(d).toEqualTypeOf<readonly unknown[]>()
      return new Error('x')
    })
    expectTypeOf(toResult((d) => new Error(String(d.length)))).toEqualTypeOf<
      <T extends NotPossiblyAnError<T> & NotABestEffort<T>>(
        value: BestEffort<T, unknown>,
      ) => Result<T, Error>
    >()
    const stringsOnly = toResult(
      (d: readonly string[]) => new Error(String(d.length)),
    )
    // @ts-expect-error D bound to string at the call: BestEffort<number, number> is not assignable to BestEffort<number, string>
    stringsOnly(bestEffort(1, [42]))
    pipe(
      bestEffort(world, [diag]),
      toResult((d) => {
        expectTypeOf(d).toEqualTypeOf<readonly Diagnostic[]>()
        return new Error('x')
      }),
    )
    expectTypeOf(toResult(toErrors, bestEffort(world, [diag]))).toEqualTypeOf<
      Result<World, WorldFormatErrors>
    >()
    toResult(
      (d) => {
        expectTypeOf(d).toEqualTypeOf<readonly Diagnostic[]>()
        return new Error('x')
      },
      bestEffort(world, [diag]),
    )
    expectTypeOf(toResult(toErrors)(bestEffort(world, [diag]))).toEqualTypeOf<
      Result<World, WorldFormatErrors>
    >()
  })
  it('recover and recoverWith: D is E, or what diagnose returns; recover(fallback) binds T at the call and E at application; recoverWith(fallback, diagnose) binds T, E and D at the call', () => {
    class Coded extends Error {
      readonly code = 7
    }
    const coded: Result<number, Coded> = success(1)
    expectTypeOf(recover(0)).toEqualTypeOf<
      <E extends Error>(result: Result<number, E>) => BestEffort<number, E>
    >()
    expectTypeOf(orElse(0)).toEqualTypeOf<
      (value: Result<number, Error>) => Success<number, Error>
    >()
    expectTypeOf(recover(0)(coded)).toEqualTypeOf<BestEffort<number, Coded>>()
    expectTypeOf(recoverWith(0, (e: Coded) => e.code)).toEqualTypeOf<
      (result: Result<number, Coded>) => BestEffort<number, number>
    >()
    expectTypeOf(recoverWith(0, (e: Coded) => e.code)(coded)).toEqualTypeOf<
      BestEffort<number, number>
    >()
    // @ts-expect-error standalone, E is Error at the call: "Property 'code' does not exist on type 'Error'"
    recoverWith(0, (e) => e.code)(coded)
    const r: Result<number, RangeError> = success(1)
    expectTypeOf(recover(0, r)).toEqualTypeOf<BestEffort<number, RangeError>>()
    expectTypeOf(recover(0)(r)).toEqualTypeOf<BestEffort<number, RangeError>>()
    expectTypeOf(
      recoverWith(0, (e): Diagnostic => ({ message: e.message }), r),
    ).toEqualTypeOf<BestEffort<number, Diagnostic>>()
    expectTypeOf(recoverWith(0, (e: RangeError) => e.message)(r)).toEqualTypeOf<
      BestEffort<number, string>
    >()
  })
  it('gather keeps D', () => {
    expectTypeOf(gather([bestEffort(1, [diag])])).toEqualTypeOf<
      BestEffort<readonly number[], Diagnostic>
    >()
  })
  it('the curried forms sit in pipe', () => {
    expectTypeOf(
      pipe(
        bestEffort(1),
        map((x: number) => String(x)),
        note([diag]),
        andThen((s: string) => bestEffort(s.length, ['x'])),
      ),
    ).toEqualTypeOf<BestEffort<number, Diagnostic | string>>()
    expectTypeOf(
      pipe(bestEffort(world), note([diag]), toResult(toErrors)),
    ).toEqualTypeOf<Result<World, WorldFormatErrors>>()
    const r: Result<number, RangeError> = success(1)
    expectTypeOf(
      pipe(
        r,
        recover(0),
        map((x: number) => x + 1),
      ),
    ).toEqualTypeOf<BestEffort<number, RangeError>>()
  })
})
