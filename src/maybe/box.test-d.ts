import { describe, expectTypeOf, it } from 'vitest'
import { Maybe } from './box.js'
import { Maybe as RootMaybe } from '../index.js'
import type { Just, Maybe as MaybeIndex, Nothing } from './index.js'
import type { Result } from '../result/index.js'

/**
 * Pins the Maybe Box surface declared in `./box.ts` — the held type every
 * member tracks, the narrowing, the negative cases the gates exist for, and
 * the merged name's two meanings (see docs/adr/0005-box-classes.md). The
 * assertions come from the typechecked prototypes on
 * `prototype/maybe-box-surface` (#43) and the tickets amending it.
 */

interface User {
  name: string
}
declare const find: (id: string) => User | undefined
declare const user: User
declare const log: (x: unknown) => void

describe('ways in and the held type', () => {
  it('from boxes a possibly-absent value, tracking both arms', () => {
    expectTypeOf(Maybe.from(find('u')).value).toEqualTypeOf<MaybeIndex<User>>()
  })

  it('just enters as a Just and map keeps it one — the Box tracks the Nothing arm', () => {
    expectTypeOf(Maybe.just(user).map((u) => u.name).value).toEqualTypeOf<
      Just<string>
    >()
  })

  it('without assertJust the Nothing arm survives a map', () => {
    expectTypeOf(Maybe.from(find('u')).map((u) => u.name).value).toEqualTypeOf<
      MaybeIndex<string>
    >()
  })

  it('nothing<T>() holds Maybe<T>, so recovery stays callable', () => {
    expectTypeOf(
      Maybe.nothing<User>().fallback(() => ({ name: 'anon' })).value,
    ).toEqualTypeOf<Just<User>>()
  })

  it('fromNullable folds null into Nothing', () => {
    expectTypeOf(Maybe.fromNullable<string | null>(null).value).toEqualTypeOf<
      MaybeIndex<string>
    >()
  })

  it('fromResult discards the error', () => {
    const r = null as unknown as Result<number, TypeError>
    expectTypeOf(Maybe.fromResult(r).value).toEqualTypeOf<MaybeIndex<number>>()
  })
})

describe('chaining members', () => {
  it('assertJust discharges the Nothing arm mid-chain', () => {
    expectTypeOf(
      Maybe.from(find('u'))
        .assertJust('must exist')
        .map((u) => u.name).value,
    ).toEqualTypeOf<Just<string>>()
  })

  it('orElse discharges Nothing eagerly', () => {
    expectTypeOf(
      Maybe.from(find('u'))
        .map((u) => u.name)
        .orElse('anon').value,
    ).toEqualTypeOf<Just<string>>()
  })

  it('act and the if* pair return this, keeping the held type', () => {
    expectTypeOf(
      Maybe.just('x')
        .act(log)
        .ifJust(log)
        .ifNothing(() => log('none')).value,
    ).toEqualTypeOf<Just<string>>()
  })
})

describe('terminals', () => {
  it('unbox() hands back the held unboxed value', () => {
    expectTypeOf(
      Maybe.from(find('u'))
        .map((u) => u.name)
        .unbox(),
    ).toEqualTypeOf<MaybeIndex<string>>()
  })

  it('unbox(fn) folds', () => {
    expectTypeOf(
      Maybe.from(find('u'))
        .map((u) => u.name)
        .unbox((v) => (v === undefined ? 0 : v.length)),
    ).toEqualTypeOf<number>()
  })
})

describe('guards and narrowing', () => {
  it('the instance predicate narrows the Box reference', () => {
    const box = Maybe.from(find('u'))
    if (box.isJust()) {
      expectTypeOf(box.value).toEqualTypeOf<User>()
    }
  })

  it('a known-Nothing Box maps to a known Nothing', () => {
    const box = Maybe.from(find('u'))
    if (box.isNothing()) {
      expectTypeOf(box.map((): string => 'x').value).toEqualTypeOf<
        Nothing<string>
      >()
    }
  })

  it('a known-Nothing callback parameter is never — the callback provably never runs', () => {
    const box = Maybe.from(find('u'))
    if (box.isNothing()) {
      // @ts-expect-error — the parameter is never; a known-Nothing carries no value to map
      box.map((u) => void u.name)
    }
  })

  it('assertJust on a known-Nothing Box collapses to never — it always throws', () => {
    const box = Maybe.from(find('u'))
    if (box.isNothing()) {
      expectTypeOf(box.assertJust().value).toEqualTypeOf<never>()
    }
  })

  it('the static guard still narrows an unboxed value', () => {
    const v = undefined as MaybeIndex<string>
    if (Maybe.isJust(v)) {
      expectTypeOf(v).toEqualTypeOf<Just<string>>()
    }
  })

  it('the poison overload is soft: a Box handed to the static resolves to never', () => {
    const box = Maybe.from(find('u'))
    expectTypeOf(Maybe.isJust(box)).toEqualTypeOf<never>()
    expectTypeOf(Maybe.isNothing(box)).toEqualTypeOf<never>()
  })
})

describe('what must not compile', () => {
  it('rejects an async map callback through NotAPromise', () => {
    // @ts-expect-error — resolve first (promise/resultify or call/resultify), then compose with .then()
    Maybe.from(find('u')).map(async (u) => u.name)
  })

  it('rejects an async act callback through NotAPromise', () => {
    // @ts-expect-error — a side effect must resolve synchronously
    Maybe.from(find('u')).act(async () => undefined)
  })

  it('rejects an orElse default that does not match the held type', () => {
    const named = Maybe.from(find('u')).map((u) => u.name)
    // @ts-expect-error — the default must be a Just of the held type
    named.orElse(0)
  })

  it('unbox(undefined) is an argument, not a zero-arg call (ADR 0003)', () => {
    // @ts-expect-error — undefined is not a folding callback
    Maybe.from(find('u')).unbox(undefined)
  })

  it('the transience rule is checker-enforced: a Box cannot travel through the type', () => {
    // `Maybe<User>` in type position is the unboxed type (decision 5), so a
    // Box does not fit it — the annotation that would store one is an error.
    // @ts-expect-error — unbox first; the boxed form has no spellable type
    const stored: Maybe<User> = Maybe.from(find('u'))
    void stored
  })

  it('the private constructor closes direct construction', () => {
    // @ts-expect-error — instances come only from the static factories
    void new Maybe()
  })

  it('there is no static map — the statics are ways in and guards only (#42)', () => {
    // @ts-expect-error — use box.map, or the functional maybe/map
    void Maybe.map
  })
})

describe('the merged name and the root re-export', () => {
  it('the type meaning is the module type, at the module arity', () => {
    expectTypeOf<Maybe<string>>().toEqualTypeOf<MaybeIndex<string>>()
  })

  it('the alias restates the arity: the type argument is required', () => {
    // @ts-expect-error — bare Maybe does not resolve, exactly like the module type
    expectTypeOf<Maybe>().toBeUnknown()
  })

  it('the root re-export carries the value meaning', () => {
    expectTypeOf(RootMaybe).toEqualTypeOf<typeof Maybe>()
  })

  it('the root re-export carries the type meaning', () => {
    expectTypeOf<RootMaybe<number>>().toEqualTypeOf<MaybeIndex<number>>()
  })
})
