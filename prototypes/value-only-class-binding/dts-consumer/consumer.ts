/**
 * PROTOTYPE — throwaway. The claims re-checked against the **emitted `.d.ts`**
 * rather than the source, because that is what a published consumer actually
 * sees. Depends on pass 1 having emitted into `.local/proto-dts`, so `run.mjs`
 * runs this third.
 */
import { expectTypeOf } from 'vitest'
import { Maybe } from '../../../.local/proto-dts/prototypes/value-only-class-binding/maybe-box.js'
import type { Maybe as MaybeValue } from '../../../src/maybe/index.js'

// @ts-expect-error — still a value, not a type, across the .d.ts boundary.
export let annotated: Maybe<number>

// @ts-expect-error — the private class name is still not importable.
export type { MaybeBox } from '../../../.local/proto-dts/prototypes/value-only-class-binding/maybe-box.js'

// @ts-expect-error — constructor still private.
export const constructed = new Maybe(3)

const chained = Maybe.from(['a', 'b'])
  .map((tags) => tags.length)
  .map((length) => `${length}`)
expectTypeOf(chained.unwrap()).toEqualTypeOf<MaybeValue<string>>()
expectTypeOf(chained.orElse('none')).toEqualTypeOf<string>()
