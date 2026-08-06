import { describe, expectTypeOf, it } from 'vitest'
import { Result } from './box.js'
import { Result as RootResult } from '../index.js'
import { assertSuccess, map as mapResult, result, success } from './index.js'
import type {
  Failure,
  NotAResult,
  Result as ResultIndex,
  Success,
} from './index.js'
import { pipe } from '../fn/index.js'

/**
 * Pins the Result Box surface declared in `./box.ts` — the held type every
 * member tracks, the error-union accumulation, the narrowing, the negative
 * cases the gates exist for, and the merged name's two meanings (see
 * docs/adr/0005-box-classes.md). The assertions come from the typechecked
 * prototype on `prototype/result-box-surface` (#44), which measured against
 * the real `/result` rather than stand-ins.
 */

declare class Err<N extends number> extends Error {
  readonly n: N
}
declare function step<N extends number>(
  n: N,
): (v: number) => ResultIndex<number, Err<N>>
declare const userError: Err<1>
declare const numberOrError: number | Err<1>
declare const maybeString: string | undefined

const full = Result.from<number, Err<1> | Err<2>>(0)
const queried = Result.from<number, Err<1>>(0)

describe('ways in', () => {
  it("from is the boundary lift, and its inference is its counterpart's exactly", () => {
    // Including the counterpart's quirk: a union argument lands wholly in T
    // with E defaulted — naming E means naming both, as with `result()`.
    const fromParity = result(numberOrError)
    void fromParity
    // `.branded`: the two sides are the same type built through different
    // alias paths, which plain toEqualTypeOf reports as a mismatch.
    expectTypeOf(Result.from(numberOrError).unbox()).branded.toEqualTypeOf<
      typeof fromParity
    >()
    expectTypeOf(Result.from<number, Err<1>>(0).unbox()).toEqualTypeOf<
      ResultIndex<number, Err<1>>
    >()
    expectTypeOf(Result.from(0).unbox()).toEqualTypeOf<
      ResultIndex<number, Error>
    >()
  })

  it('success seeds with an empty error union — E defaults to never, unlike result/success', () => {
    expectTypeOf(Result.success(0).unbox()).toEqualTypeOf<
      Success<number, never>
    >()
  })

  it("…so a chain accumulates exactly the links' arms, with no riding Error arm", () => {
    expectTypeOf(
      Result.success(0).andThen(step(1)).andThen(step(2)).unbox(),
    ).toEqualTypeOf<ResultIndex<number, Err<1> | Err<2>>>()
  })

  it('failure mirrors its counterpart: error-first, phantom T defaulted', () => {
    expectTypeOf(Result.failure(userError).unbox()).toEqualTypeOf<
      Failure<unknown, Err<1>>
    >()
  })

  it('fromMaybe is the inlined crossing, applied form only — statics never curry', () => {
    expectTypeOf(
      Result.fromMaybe(userError, maybeString).unbox(),
    ).toEqualTypeOf<ResultIndex<string, Err<1>>>()
  })
})

describe('transforms track the held type', () => {
  it('map stays in the success channel and receives the success value', () => {
    const mapped = full.map((v) => {
      expectTypeOf(v).toEqualTypeOf<number>()
      return String(v)
    })
    expectTypeOf(mapped.unbox()).toEqualTypeOf<
      ResultIndex<string, Err<1> | Err<2>>
    >()
  })

  it("on the full held type the Box's map equals the applied functional form", () => {
    const fullUnboxed = full.unbox()
    const pipeMapped = pipe(
      fullUnboxed,
      mapResult((v: number) => String(v)),
    )
    void pipeMapped
    expectTypeOf(full.map((v) => String(v)).unbox()).branded.toEqualTypeOf<
      typeof pipeMapped
    >()
  })

  it('map on a Success-only Box does not re-admit a Failure arm — Failure<U, never> self-collapses', () => {
    const sure = Result.success(0)
    expectTypeOf(sure.map((v) => String(v)).unbox()).toEqualTypeOf<
      ResultIndex<string, never>
    >()
    expectTypeOf<ResultIndex<string, never>>().toEqualTypeOf<
      Success<string, never>
    >()
  })

  it('andThen accumulates the error union', () => {
    expectTypeOf(full.andThen(step(3)).andThen(step(4)).unbox()).toEqualTypeOf<
      ResultIndex<number, Err<1> | Err<2> | Err<3> | Err<4>>
    >()
  })

  it('mapError translates: the arms collapse to the translation', () => {
    const translated = full.mapError((e) => {
      expectTypeOf(e).toEqualTypeOf<Err<1> | Err<2>>()
      return new Err<9>()
    })
    expectTypeOf(translated.unbox()).toEqualTypeOf<
      ResultIndex<number, Err<9>>
    >()
  })

  it('…and recovery empties the union', () => {
    expectTypeOf(full.mapError(() => success(0)).unbox()).toEqualTypeOf<
      ResultIndex<number, never>
    >()
  })

  it('orElse holds a Success and says so', () => {
    expectTypeOf(full.orElse(0).unbox()).toEqualTypeOf<
      Success<number, Err<1> | Err<2>>
    >()
  })

  it('after a mid-chain fallback the dead arms stay dead — unlike pipe (#49)', () => {
    expectTypeOf(
      full
        .fallback(() => success<number, Err<1> | Err<2>>(0))
        .andThen(step(5))
        .unbox(),
    ).toEqualTypeOf<ResultIndex<number, Err<5>>>()
  })
})

describe('guards, asserts, narrowing', () => {
  it('the instance predicates narrow the same class to a narrower argument', () => {
    if (queried.isSuccess()) {
      expectTypeOf(queried.unbox()).toEqualTypeOf<Success<number, Err<1>>>()
      // …and a narrowed Box maps without re-admitting the Failure arm.
      expectTypeOf(queried.map(String).unbox()).toEqualTypeOf<
        ResultIndex<string, never>
      >()
    }
    if (queried.isFailure()) {
      expectTypeOf(queried.unbox()).toEqualTypeOf<Failure<number, Err<1>>>()
      queried.ifFailure((e) => {
        expectTypeOf(e).toEqualTypeOf<Err<1>>()
      })
    }
  })

  it('assertSuccess chains — not a terminal — and keeps the phantom channel', () => {
    expectTypeOf(queried.assertSuccess().unbox()).toEqualTypeOf<
      Success<number, Err<1>>
    >()
  })

  it('on a Failure-only Box the checker proves the assert always throws', () => {
    const doomed = Result.failure<Err<1>, number>(userError)
    expectTypeOf(doomed.assertSuccess().unbox()).toEqualTypeOf<never>()
  })

  it('the statics survive restatement, pinned by parity with their counterparts', () => {
    const raw = 0 as unknown as ResultIndex<number, Err<1>>
    if (Result.isSuccess(raw)) {
      expectTypeOf(raw).toEqualTypeOf<Success<number, Err<1>>>()
    }
    const assertParity = assertSuccess(raw)
    void assertParity
    expectTypeOf(Result.assertSuccess(raw)).branded.toEqualTypeOf<
      typeof assertParity
    >()
    expectTypeOf(Result.assertSuccess<number, Err<1>>(raw)).toEqualTypeOf<
      Success<number, Err<1>>
    >()
  })

  it('the poison overload is soft: a Box handed to the static resolves to never', () => {
    expectTypeOf(Result.isSuccess(queried)).toEqualTypeOf<never>()
    expectTypeOf(Result.isFailure(queried)).toEqualTypeOf<never>()
  })
})

describe('side effects and terminals', () => {
  it('act receives the whole held union, the if* pair their arm, all three return this', () => {
    const acted = queried
      .act((v) => {
        expectTypeOf(v).toEqualTypeOf<ResultIndex<number, Err<1>>>()
      })
      .ifSuccess((v) => {
        expectTypeOf(v).toEqualTypeOf<number>()
      })
      .ifFailure((e) => {
        expectTypeOf(e).toEqualTypeOf<Err<1>>()
      })
    expectTypeOf(acted).toEqualTypeOf(queried)
  })

  it('the terminals: zero-arg unbox, the fold overload, the getter', () => {
    expectTypeOf(queried.unbox()).toEqualTypeOf<ResultIndex<number, Err<1>>>()
    expectTypeOf(queried.unbox((r) => String(r))).toEqualTypeOf<string>()
    expectTypeOf(queried.result).toEqualTypeOf<ResultIndex<number, Err<1>>>()
  })
})

describe('what must not compile', () => {
  it('map rejects a Result-returning callback — NotAResult names andThen', () => {
    // @ts-expect-error — use andThen for a second fallible step
    full.map((v) => step(1)(v))
  })

  it("map rejects an async callback through NotAResult's thenable arm", () => {
    // @ts-expect-error — resolve first, then compose with .then()
    full.map(async (v) => v)
  })

  it('andThen rejects async through NotAPromise', () => {
    // @ts-expect-error — resolve first, then compose with .then()
    full.andThen(async (v) => success(v))
  })

  it("act's callback must be synchronous too", () => {
    // @ts-expect-error — a side effect must resolve synchronously
    full.act(async () => undefined)
  })

  it('there is no static map or mapError — #42 dissolved the static curries', () => {
    // @ts-expect-error — use box.map, or the functional result/map
    void Result.map
    // @ts-expect-error — use box.mapError, or the functional result/mapError
    void Result.mapError
  })

  it('unbox(undefined) is an argument, not a zero-arg call (ADR 0003)', () => {
    // @ts-expect-error — undefined is not a folding callback
    queried.unbox(undefined)
  })

  it('the transience rule is checker-enforced: a Box cannot travel through the type', () => {
    // @ts-expect-error — unbox first; the boxed form has no spellable type
    const stored: Result<number, Error> = Result.from(0)
    void stored
  })

  it('the private constructor closes direct construction', () => {
    // @ts-expect-error — instances come only from the static factories
    void new Result()
  })

  it("NotAResult's wording is pinned", () => {
    expectTypeOf<
      NotAResult<ResultIndex<number, Error>>
    >().toEqualTypeOf<'This callback returns a Result — use andThen, not map'>()
  })
})

describe('the merged name and the root re-export', () => {
  it('the type meaning is the module type, defaults included', () => {
    expectTypeOf<Result<number>>().toEqualTypeOf<ResultIndex<number, Error>>()
    expectTypeOf<Result<number, Err<1>>>().toEqualTypeOf<
      ResultIndex<number, Err<1>>
    >()
  })

  it('the alias restates the arity: the value argument is required', () => {
    // @ts-expect-error — bare Result does not resolve, exactly like the module type
    expectTypeOf<Result>().toBeUnknown()
  })

  it('the root re-export carries the value meaning', () => {
    expectTypeOf(RootResult).toEqualTypeOf<typeof Result>()
  })

  it('the root re-export carries the type meaning', () => {
    expectTypeOf<RootResult<number>>().toEqualTypeOf<
      ResultIndex<number, Error>
    >()
  })
})
