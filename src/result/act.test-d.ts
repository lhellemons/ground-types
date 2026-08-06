import { describe, expectTypeOf, it } from 'vitest'
import { act, ifFailure, ifSuccess } from './act.js'
import { map } from './index.js'
import { pipe } from '../fn/index.js'
import type { Result } from './index.js'

/**
 * Pins the act family's signatures on `/result` (#50): callbacks generic
 * over `R extends NotAPromise<R>` with returns discarded, thenables a
 * worded compile error, returns widened to `Result<T, E>`, `ifFailure`'s
 * error parameter narrowing like `mapError`'s, and deferred-generic
 * unapplied forms mirroring `result/map`.
 */

class Invalid extends Error {
  readonly kind = 'Invalid' as const
}

declare const input: Result<number, RangeError>
declare const log: (x: unknown) => void

describe('act', () => {
  it('applied: receives the whole Result, hands it back widened', () => {
    expectTypeOf(act(log, input)).toEqualTypeOf<Result<number, RangeError>>()
  })

  it('applied: a sync return is accepted and discarded', () => {
    expectTypeOf(act((r) => JSON.stringify(r), input)).toEqualTypeOf<
      Result<number, RangeError>
    >()
  })

  it('deferred: stays generic, so a wide logger does not collapse the chain', () => {
    expectTypeOf(
      pipe(
        input,
        act(log),
        map((n: number) => n * 2),
      ),
    ).toEqualTypeOf<Result<number, RangeError>>()
  })
})

describe('ifSuccess', () => {
  it('applied: receives the success value, hands the whole Result back', () => {
    expectTypeOf(ifSuccess((n: number) => log(n), input)).toEqualTypeOf<
      Result<number, RangeError>
    >()
  })

  it('deferred: binds at application, sync return discarded', () => {
    expectTypeOf(
      pipe(
        input,
        ifSuccess((n: number) => n + 1),
      ),
    ).toEqualTypeOf<Result<number, RangeError>>()
  })

  it('rejects a callback for a value the chain cannot carry', () => {
    // @ts-expect-error — the callback's parameter must fit the Success
    ifSuccess((s: string) => s.length, input)
  })
})

describe('ifFailure', () => {
  it("applied: receives the error, narrowing like mapError's parameter", () => {
    expectTypeOf(ifFailure((e: RangeError) => log(e), input)).toEqualTypeOf<
      Result<number, RangeError>
    >()
  })

  it('a wide handler fits any chain', () => {
    expectTypeOf(ifFailure((e: Error) => log(e), input)).toEqualTypeOf<
      Result<number, RangeError>
    >()
  })

  it('rejects a handler for an error class the chain cannot carry', () => {
    // A structurally *distinct* error class rejects correctly. lib.d.ts's
    // own subclasses (RangeError vs SyntaxError) are structurally
    // identical and cannot be told apart — true of mapError today too;
    // recorded as a caveat in docs/adr/0005-box-classes.md.
    // @ts-expect-error — the chain carries no Invalid
    ifFailure((e: Invalid) => log(e.kind), input)
  })

  it('deferred: binds at application', () => {
    expectTypeOf(
      pipe(
        input,
        ifFailure((e: RangeError) => log(e)),
      ),
    ).toEqualTypeOf<Result<number, RangeError>>()
  })
})

describe('the synchronous-only rule', () => {
  it('rejects async callbacks in the applied forms', () => {
    // @ts-expect-error — an unawaited side effect reads as awaited; keep it synchronous
    act(async () => undefined, input)
    // @ts-expect-error — same rule for the conditional forms
    ifSuccess(async (n: number) => n, input)
    // @ts-expect-error — and for the failure arm
    ifFailure(async (e: Error) => e, input)
  })

  it('rejects async callbacks in the deferred forms too', () => {
    // @ts-expect-error — the constraint holds on both paths
    act(async () => undefined)
    // @ts-expect-error — the constraint holds on both paths
    ifSuccess(async (n: number) => n)
  })
})
