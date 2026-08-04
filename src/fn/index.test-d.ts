import { describe, expectTypeOf, it } from 'vitest'
import { pipe } from './index.js'
import { andThen as mandThen, map as mmap, maybe } from '../maybe/index.js'
import {
  andThen as randThen,
  failure,
  fromMaybe,
  map as rmap,
  orElse as rorElse,
  success,
} from '../result/index.js'
import type { Success } from '../result/index.js'

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
