/* PROTOTYPE #117 — throwaway type probes: where the guard bites, how a
   Maybe part reads, what the combinators infer. */
import { describe, expectTypeOf, it } from 'vitest'
import type { Result } from '../../src/result/index.js'
import { success } from '../../src/result/index.js'
import type { Maybe } from '../../src/maybe/index.js'
import {
  andThen,
  bestEffort,
  gather,
  map,
  note,
  recover,
  toResult,
  toResultUnguarded,
} from './best-effort.js'
import type { BestEffort } from './best-effort.js'
import { readOpenWhen, World, WorldFormatErrors } from './consumer.js'
import type { Diagnostic, WorldFormatError } from './consumer.js'

const toErrors = (d: readonly Diagnostic[]) => new WorldFormatErrors(d)
declare const world: World
declare const diag: Diagnostic

describe('the guard', () => {
  it('toResult carries NotPossiblyAnError on T: an Error, an all-optional object and an unresolved T are refused', () => {
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
  it('the constructor, map and recover carry no guard: the box keeps value and diagnostics apart', () => {
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
    expectTypeOf(recover(r, new Error('fallback'))).toEqualTypeOf<
      BestEffort<Error, RangeError>
    >()
    function generic<T>(result: Result<T, RangeError>, fallback: T) {
      return recover(result, fallback)
    }
    expectTypeOf(generic<number>).returns.toEqualTypeOf<
      BestEffort<number, RangeError>
    >()
  })
})

describe('a Maybe part', () => {
  it('BestEffort<Maybe<T>, D> is a three-state reader: Just, Nothing, Nothing with a diagnostic', () => {
    expectTypeOf(readOpenWhen).returns.toEqualTypeOf<
      BestEffort<Maybe<string>, WorldFormatError>
    >()
    const absent: BestEffort<Maybe<string>, WorldFormatError> = bestEffort(
      undefined,
    )
    void absent
  })
  it('toResult of a Maybe part is a Result of a Maybe, as #65 reads ok/absent/error', () => {
    expectTypeOf(
      toResult(toErrors, readOpenWhen(undefined, 'b', [], 0)),
    ).toEqualTypeOf<Result<Maybe<string>, WorldFormatErrors>>()
  })
  it('a generic reader cannot return bestEffort(value) as BestEffort<Maybe<T>, D> without a cast', () => {
    function reader<T>(value: T | undefined): BestEffort<Maybe<T>, never> {
      // @ts-expect-error Maybe<T> does not reduce for an unresolved T
      return bestEffort(value)
    }
    void reader
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
  it('map types its callback parameter from the value when the value is not itself a callback-taking call', () => {
    map((x) => {
      expectTypeOf(x).toEqualTypeOf<number>()
      return x
    }, bestEffort(1))
    /* Nested: the inner andThen's callback is context-sensitive too, so the
       outer parameter falls to unknown and needs an annotation (the port's
       validateBoardEntry has one). */
    map(
      (x) => {
        expectTypeOf(x).toEqualTypeOf<unknown>()
        return x
      },
      andThen((p) => gather([bestEffort(p)]), bestEffort(1)),
    )
    expectTypeOf(map((x: number) => String(x), bestEffort(1))).toEqualTypeOf<
      BestEffort<string, never>
    >()
  })
  it('the curried map has no value to read D from: D is unknown, spelled by hand as /result does', () => {
    expectTypeOf(
      map((x: number) => String(x))(bestEffort(1, [diag])),
    ).toEqualTypeOf<BestEffort<string, unknown>>()
    expectTypeOf(
      map<number, string, Diagnostic>((x) => String(x))(bestEffort(1, [diag])),
    ).toEqualTypeOf<BestEffort<string, Diagnostic>>()
  })
  it('andThen unions the diagnostic types and keeps the value of the second step', () => {
    const first = bestEffort(1, [diag])
    expectTypeOf(
      andThen((x: number) => bestEffort(String(x), ['s']), first),
    ).toEqualTypeOf<BestEffort<string, Diagnostic | string>>()
  })
  it('toResult reads D from the value into toError, and E from toError', () => {
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
  })
  it('note and gather keep D; recover takes D from diagnose, else E', () => {
    expectTypeOf(note([diag], bestEffort(1))).toEqualTypeOf<
      BestEffort<number, Diagnostic>
    >()
    expectTypeOf(gather([bestEffort(1, [diag])])).toEqualTypeOf<
      BestEffort<readonly number[], Diagnostic>
    >()
    const r: Result<number, RangeError> = success(1)
    expectTypeOf(recover(r, 0)).toEqualTypeOf<BestEffort<number, RangeError>>()
    expectTypeOf(
      recover(r, 0, (e): Diagnostic => ({ message: e.message })),
    ).toEqualTypeOf<BestEffort<number, Diagnostic>>()
  })
})
