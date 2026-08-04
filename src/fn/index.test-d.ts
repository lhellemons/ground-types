import { describe, expectTypeOf, it } from 'vitest'
import { compose, pipe } from './index.js'
import type { Mapper } from './index.js'
import { andThen as mandThen, map as mmap, maybe } from '../maybe/index.js'
import type { Maybe } from '../maybe/index.js'
import {
  andThen as randThen,
  failure,
  fromMaybe,
  map as rmap,
  orElse as rorElse,
  success,
} from '../result/index.js'
import type { Result, Success } from '../result/index.js'

class TooShort extends RangeError {
  readonly kind = 'TooShort' as const
}

declare const input: number | undefined

describe('pipe', () => {
  it("rejects a step whose parameter does not fit the previous step's return type", () => {
    const toNumber = (s: string): number => Number(s)
    const boolOnly = (b: boolean): string => (b ? 'yes' : 'no')

    // @ts-expect-error - boolOnly expects boolean, toNumber returns number
    pipe('42', toNumber, boolOnly)
  })

  it('rejects a value with no steps to pipe it through', () => {
    // @ts-expect-error - there is no zero-step overload; pipe needs at least one step
    pipe(21)
  })

  it('rejects an eleventh step, one past the longest overload', () => {
    const inc = (n: number) => n + 1

    // @ts-expect-error - only 10 steps are typed; an 11th has no overload to match
    pipe(0, inc, inc, inc, inc, inc, inc, inc, inc, inc, inc, inc)
  })

  it('threads a distinct type through every step of a ten-step chain', () => {
    const out = pipe(
      0,
      (n: number) => n.toString(),
      (s: string) => s.length,
      (n: number) => n > 0,
      (b: boolean) => (b ? 'yes' : 'no'),
      (s: string) => s.toUpperCase(),
      (s: string) => s.length,
      (n: number) => BigInt(n),
      (n: bigint) => n.toString(),
      (s: string) => new Map([[s, s.length]]),
      (m: Map<string, number>) => m.size,
    )

    expectTypeOf(out).toEqualTypeOf<number>()
  })

  it('survives a chain mixing maybe and result, bridged mid-chain', () => {
    const out = pipe(
      maybe(input),
      mmap((n: number) => n * 2),
      mandThen((n: number) => (n > 0 ? n : undefined)),
      fromMaybe(new Error('missing')),
      rmap((n: number) => n.toString()),
      randThen((s: string) =>
        s.length > 3 ? success(s) : failure(new TooShort('too short')),
      ),
      rorElse('fallback'),
    )

    expectTypeOf(out).toEqualTypeOf<Success<string, Error | TooShort>>()
  })
})

describe('compose', () => {
  it("rejects a step whose return type does not fit the neighbouring step's parameter", () => {
    const toNumber = (s: string): number => Number(s)
    const boolOnly = (b: boolean): string => (b ? 'yes' : 'no')

    // @ts-expect-error - toNumber returns number, boolOnly expects a boolean
    compose(boolOnly, toNumber)
  })

  it('rejects an eleventh Mapper, one past the longest overload', () => {
    const inc = (n: number) => n + 1

    // @ts-expect-error - only 10 Mappers are typed; an 11th has no overload to match
    compose(inc, inc, inc, inc, inc, inc, inc, inc, inc, inc, inc)
  })

  it('threads a distinct type through every step of a ten-Mapper chain, right to left', () => {
    const out = compose(
      (m: Map<string, number>) => m.size,
      (s: string) => new Map([[s, s.length]]),
      (n: bigint) => n.toString(),
      (n: number) => BigInt(n),
      (s: string) => s.length,
      (s: string) => s.toUpperCase(),
      (b: boolean) => (b ? 'yes' : 'no'),
      (n: number) => n > 0,
      (s: string) => s.length,
      (n: number) => n.toString(),
    )(0)

    expectTypeOf(out).toEqualTypeOf<number>()
  })

  it('builds a reusable Mapper mixing maybe and result, applied right to left', () => {
    // Each step is pinned to an explicit Mapper<T, U> rather than passed to
    // compose bare: result/map and result/andThen return a function that is
    // itself still generic (`<T extends A, E extends Error = Error>(value:
    // Result<T, E>) => ...`), by design, so it can accept a Result narrower
    // than the one it was configured for. pipe's mixed chain (above) can
    // resolve that generic because it has a concrete value in the same call
    // to anchor inference against; compose never does — it is point-free by
    // definition — so nothing forces the step's own T and E to a concrete
    // type. Annotating each step is what pipe's value argument does for free.
    const step1: Mapper<Maybe<number>, Maybe<number>> = mmap(
      (n: number) => n * 2,
    )
    const step2: Mapper<Maybe<number>, Maybe<number>> = mandThen((n: number) =>
      n > 0 ? n : undefined,
    )
    const step3: Mapper<Maybe<number>, Result<number, Error>> = fromMaybe(
      new Error('missing'),
    )
    const step4: Mapper<Result<number, Error>, Result<string, Error>> = rmap(
      (n: number) => n.toString(),
    )
    const step5: Mapper<
      Result<string, Error>,
      Result<string, TooShort | Error>
    > = randThen((s: string) =>
      s.length > 3 ? success(s) : failure(new TooShort('too short')),
    )
    const step6: Mapper<
      Result<string, TooShort | Error>,
      Success<string, TooShort | Error>
    > = rorElse('fallback')

    const fallbackWidget = compose(step6, step5, step4, step3, step2, step1)
    const out = fallbackWidget(maybe(input))

    expectTypeOf(out).toEqualTypeOf<Success<string, Error | TooShort>>()
  })
})
