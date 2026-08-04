import { describe, expectTypeOf, it } from 'vitest'
import {
  andThen,
  fallback,
  fromNullable,
  map,
  maybe,
  nothing,
  orElse,
} from './index.js'
import type { Just, Maybe, Nothing } from './index.js'
import type { NotAPromise } from '../result/index.js'

declare const input: Maybe<number>

describe('map, curried and applied', () => {
  it('returns a Mapper when the value is omitted', () => {
    const double = map((n: number) => n * 2)

    expectTypeOf(double).toEqualTypeOf<
      (value: Maybe<number>) => Maybe<number>
    >()
  })

  it('infers the mapped Maybe when the value is supplied', () => {
    const labelled = map((n: number) => `n-${n}`, input)

    expectTypeOf(labelled).toEqualTypeOf<Maybe<string>>()
  })

  it('infers through an argument that is statically Nothing', () => {
    // `Nothing<number>` erases to plain `undefined`, which is exactly the
    // shape that collapses inference into `Maybe<T>`'s conditional — the
    // reason the applied form's `value` is spelled `T | undefined`.
    const labelled = map((n: number) => `n-${n}`, nothing<number>())

    expectTypeOf(labelled).toEqualTypeOf<Maybe<string>>()
  })
})

describe('map with a callback that returns a thenable', () => {
  it('rejects a callback that returns a Promise — map runs synchronously', () => {
    // Without the guard this compiled and produced Maybe<Promise<string>>:
    // a Just that is an unresolved Promise, present whatever it settles to.
    // @ts-expect-error - resolve first (promise/resultify or call/resultify), then compose with .then()
    map(async (n: number) => `n-${n}`)
    // @ts-expect-error - resolve first (promise/resultify or call/resultify), then compose with .then()
    map(async (n: number) => `n-${n}`, input)
  })

  it('rejects a callback that returns a non-native thenable', () => {
    // A custom deferred resolves via `then` without being a real Promise
    // instance; detection goes by shape, exactly as in result/map.
    const makeThenable = (
      n: number,
    ): { then(onfulfilled: (v: number) => void): void } => ({
      then: (onfulfilled) => onfulfilled(n),
    })
    // @ts-expect-error - resolve first (promise/resultify or call/resultify), then compose with .then()
    map(makeThenable)
  })

  it('rejects a callback whose return type is a sync/async union', () => {
    const maybeAsync = (n: number): number | Promise<number> =>
      n > 0 ? n : Promise.resolve(n)
    // @ts-expect-error - resolve first (promise/resultify or call/resultify), then compose with .then()
    map(maybeAsync)
  })

  it('inherits the guard through andThen, the true alias', () => {
    // @ts-expect-error - resolve first (promise/resultify or call/resultify), then compose with .then()
    andThen(async (n: number) => `n-${n}`)
  })

  it('pins the diagnostic to the same wording result/map surfaces', () => {
    // `@ts-expect-error` alone would accept any rejection; pin the literal
    // text so the compiler keeps naming the sanctioned fix.
    expectTypeOf<
      NotAPromise<Promise<number>>
    >().toEqualTypeOf<'This callback returns a Promise (or thenable) — resolve it first with promise/resultify or call/resultify, then compose with .then()'>()
  })
})

describe('orElse and fallback, applied', () => {
  it('infer the unwrapped Just when the value is supplied', () => {
    expectTypeOf(orElse(0, input)).toEqualTypeOf<number>()
    expectTypeOf(fallback(() => 0, input)).toEqualTypeOf<number>()
  })
})

describe('bare case annotations', () => {
  it('lets Nothing be written bare: exactly undefined', () => {
    expectTypeOf<Nothing>().toEqualTypeOf<undefined>()
  })

  it('lets Just be written bare: plain unknown, a reading for humans', () => {
    // The default cannot exclude undefined without knowing T — bare Just
    // is a readability affordance, not a checked constraint.
    expectTypeOf<Just>().toEqualTypeOf<unknown>()
  })

  it('keeps Maybe explicit — the primary vocabulary type takes its argument', () => {
    // A bare Maybe would evaluate to plain unknown: an annotation claiming
    // "may be absent" that the checker holds you to nothing on.
    // @ts-expect-error - Maybe requires its type argument
    const bare: Maybe = undefined
    void bare
  })
})

declare const found: number | undefined

describe('maybe', () => {
  it('infers the wrapped type from a boundary T | undefined', () => {
    expectTypeOf(maybe(found)).toEqualTypeOf<Maybe<number>>()
  })
})

declare const queried: Element | null
declare const optional: string | null | undefined

describe('fromNullable', () => {
  it('folds the null arm away rather than carrying it', () => {
    expectTypeOf(fromNullable(queried)).toEqualTypeOf<Maybe<Element>>()
    expectTypeOf(fromNullable(optional)).toEqualTypeOf<Maybe<string>>()
  })
})
