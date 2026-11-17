/* PROTOTYPE #117 — throwaway type probes: where the guards bite, how a
   Maybe part reads, what each form infers. Every ADR sentence about the
   types names one of these. */
import { describe, expectTypeOf, it } from 'vitest'
import type { Result } from '../../src/result/index.js'
import { success } from '../../src/result/index.js'
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
import type { BestEffort } from './best-effort.js'
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
  })
  it('the constructor, map and the recover fallback carry no guard: the box keeps value and diagnostics apart', () => {
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
  })
  it('an annotated callback types the result in both forms, and the curried form binds D at application', () => {
    expectTypeOf(map((x: number) => String(x), bestEffort(1))).toEqualTypeOf<
      BestEffort<string, never>
    >()
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
  it('note unions its D with the value’s, applied and curried', () => {
    expectTypeOf(note([diag], bestEffort(1))).toEqualTypeOf<
      BestEffort<number, Diagnostic>
    >()
    expectTypeOf(note([diag])(bestEffort(1, ['s']))).toEqualTypeOf<
      BestEffort<number, Diagnostic | string>
    >()
  })
  it('toResult reads D from the value into toError in the applied form, E from toError, and the curried form binds T at application', () => {
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
  it('recover and recoverWith: D is E, or what diagnose returns; curried forms bind at application', () => {
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
