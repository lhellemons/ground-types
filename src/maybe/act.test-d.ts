import { describe, expectTypeOf, it } from 'vitest'
import { act, ifJust, ifNothing, map } from './index.js'
import { pipe } from '../fn/index.js'
import type { Maybe } from './index.js'

/**
 * Pins the act family's signatures on `/maybe` (#50): callbacks generic
 * over `R extends NotAPromise<R>` with returns discarded, thenables a
 * worded compile error, returns widened to `Maybe<T>`, and — unlike
 * `map`/`andThen` — deferred-generic unapplied forms, so a wide callback
 * (every logger) does not collapse a pipe chain.
 */

interface User {
  name: string
}
declare const find: (id: string) => User | undefined
declare const log: (x: unknown) => void

describe('act', () => {
  it('applied: receives the whole Maybe, hands it back widened', () => {
    expectTypeOf(act(log, find('u'))).toEqualTypeOf<Maybe<User>>()
  })

  it('applied: a sync return is accepted and discarded', () => {
    expectTypeOf(act((v) => JSON.stringify(v), find('u'))).toEqualTypeOf<
      Maybe<User>
    >()
  })

  it('deferred: stays generic, so a wide logger does not collapse the chain', () => {
    expectTypeOf(
      pipe(
        find('u'),
        act(log),
        map((u) => u.name),
      ),
    ).toEqualTypeOf<Maybe<string>>()
  })

  it('applied form spells its value T | undefined, per ADR 0003', () => {
    expectTypeOf(act(log, undefined as string | undefined)).toEqualTypeOf<
      Maybe<string>
    >()
  })
})

describe('ifJust', () => {
  it('applied: receives the Just, hands the whole Maybe back', () => {
    expectTypeOf(ifJust((u: User) => log(u.name), find('u'))).toEqualTypeOf<
      Maybe<User>
    >()
  })

  it('deferred: binds at application', () => {
    expectTypeOf(
      pipe(
        find('u'),
        ifJust((u: User) => u.name.length),
      ),
    ).toEqualTypeOf<Maybe<User>>()
  })

  it('rejects a callback for a value the chain cannot carry', () => {
    // @ts-expect-error — the callback's parameter must fit the Just
    ifJust((s: string) => s.length, find('u'))
  })
})

describe('ifNothing', () => {
  it('applied: the callback takes no argument — a Nothing carries nothing', () => {
    expectTypeOf(ifNothing(() => log('none'), find('u'))).toEqualTypeOf<
      Maybe<User>
    >()
  })

  it('deferred: binds at application, sync return discarded', () => {
    expectTypeOf(
      pipe(
        find('u'),
        ifNothing(() => 0),
      ),
    ).toEqualTypeOf<Maybe<User>>()
  })
})

describe('the synchronous-only rule', () => {
  it('rejects async callbacks in the applied forms', () => {
    // @ts-expect-error — an unawaited side effect reads as awaited; keep it synchronous
    act(async () => undefined, find('u'))
    // @ts-expect-error — same rule for the conditional form
    ifJust(async (u: User) => u, find('u'))
    // @ts-expect-error — and for the absent case
    ifNothing(async () => undefined, find('u'))
  })

  it('rejects async callbacks in the deferred forms too', () => {
    // @ts-expect-error — the constraint holds on both paths
    act(async () => undefined)
    // @ts-expect-error — the constraint holds on both paths
    ifNothing(async () => undefined)
  })

  it('deliberate fire-and-forget stays expressible', () => {
    expectTypeOf(
      act((v) => {
        void Promise.resolve(v)
      }, find('u')),
    ).toEqualTypeOf<Maybe<User>>()
  })
})
