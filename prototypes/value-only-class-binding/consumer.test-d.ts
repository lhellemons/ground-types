/**
 * PROTOTYPE — throwaway. The five properties issue #38 asks about, each
 * written so that `tsc --noEmit` passing IS the proof:
 *
 * - properties that must hold are `expectTypeOf` assertions;
 * - properties that must FAIL are `@ts-expect-error`, which is itself an
 *   error when the line below it compiles.
 *
 * So a clean typecheck means every claim below held, in both directions.
 */
import { expectTypeOf } from 'vitest'
import { Maybe } from './maybe-box.js'
import { Fn } from './fn-box.js'
import type { Maybe as MaybeValue } from '../../src/maybe/index.js'

/* ------------------------------------------------------------------ *
 * 1. `Maybe<T>` as a type annotation is a compile error
 * ------------------------------------------------------------------ */

// @ts-expect-error — 'Maybe' refers to a value, but is being used as a type.
export let annotated: Maybe<number>

// @ts-expect-error — same, bare and without a type argument.
export let annotatedBare: Maybe

// @ts-expect-error — the private class name is not importable either.
export type { MaybeBox } from './maybe-box.js'

/* ------------------------------------------------------------------ *
 * 2. `Maybe.from(v)` works and infers `T` from the argument
 * ------------------------------------------------------------------ */

const fromNumber = Maybe.from(3)
expectTypeOf(fromNumber.unwrap()).toEqualTypeOf<MaybeValue<number>>()

const fromMaybeString = Maybe.from<string>(undefined)
expectTypeOf(fromMaybeString.unwrap()).toEqualTypeOf<MaybeValue<string>>()

const justObject = Maybe.just({ id: 1, name: 'a' })
expectTypeOf(justObject.unwrap()).toEqualTypeOf<
  MaybeValue<{ id: number; name: string }>
>()

// Explicit type arguments still reach the static side through the `const`.
const explicitNothing = Maybe.nothing<Date>()
expectTypeOf(explicitNothing.unwrap()).toEqualTypeOf<MaybeValue<Date>>()

/* ------------------------------------------------------------------ *
 * 3. The constructor is genuinely unreachable from outside
 * ------------------------------------------------------------------ */

// @ts-expect-error — Constructor of class 'MaybeBox' is private.
export const constructed = new Maybe(3)

// @ts-expect-error — and cannot be reached by subclassing either.
export class Sneaky extends Maybe<number> {}

/* ------------------------------------------------------------------ *
 * 4. Chained calls infer through several links without annotation
 * ------------------------------------------------------------------ */

const chained = Maybe.from({ id: 1, tags: ['a', 'b'] })
  .map((record) => record.tags)
  .map((tags) => tags.length)
  .filter((length) => length > 1)
  .map((length) => `${length} tags`)

expectTypeOf(chained.unwrap()).toEqualTypeOf<MaybeValue<string>>()
expectTypeOf(chained.orElse('none')).toEqualTypeOf<string>()

// The callback parameter is inferred at every link, not just the first.
Maybe.from(new Date()).map((date) => {
  expectTypeOf(date).toEqualTypeOf<Date>()
  return date.getTime()
})

// Boxing a function rather than a value behaves identically.
const composed = Fn.of((n: number) => n * 2)
  .map((n) => `${n}`)
  .map((s) => s.length)
expectTypeOf(composed.unwrap()).toEqualTypeOf<(t: number) => number>()

/* ------------------------------------------------------------------ *
 * The escape hatches — unspellable by NAME, still derivable structurally.
 * These compile on purpose; the report treats them as findings, not wins.
 * ------------------------------------------------------------------ */

// The obvious escape hatch is CLOSED by the private constructor:
// @ts-expect-error — cannot assign a 'private' constructor type to a 'public' one.
export type RecoveredByInstanceType = InstanceType<typeof Maybe<string>>

// This one is OPEN — a static factory's return type recovers the instance type.
export type RecoveredByReturnType = ReturnType<typeof Maybe.from<string>>
declare const recovered: RecoveredByReturnType
expectTypeOf(recovered.unwrap()).toEqualTypeOf<MaybeValue<string>>()

// A Box is not assignable to the unboxed encoding, so a stored `Maybe<T>`
// field still cannot hold one even where the Box type has been recovered.
// @ts-expect-error — MaybeBox<string> is not assignable to string | undefined.
export const stored: MaybeValue<string> = Maybe.from('a')

/* ------------------------------------------------------------------ *
 * Declaration emit — see `declaration-leak.ts` for the case that must FAIL.
 * Local (unexported) bindings are untouched: the chain still works inside a
 * function body, which is the only place a Box is supposed to live.
 * ------------------------------------------------------------------ */

export function usesABoxInternally(n: number): MaybeValue<string> {
  const box = Maybe.from(n).map((value) => `${value}`)
  return box.unwrap()
}
