/**
 * PROTOTYPE — throwaway. The ergonomic hazard the value-only binding creates:
 * `Maybe` the class value and `Maybe` the unboxed type alias are two different
 * exports with the same name, from two different subpaths. What happens in a
 * file that wants both?
 */
import { expectTypeOf } from 'vitest'
import { Maybe } from './maybe-box.js'
import type { Maybe as UnboxedMaybe } from '../../src/maybe/index.js'

/* Aliasing one of them works, and reads fine. */
export const aliased: UnboxedMaybe<number> = Maybe.from(3).unwrap()
expectTypeOf(aliased).toEqualTypeOf<UnboxedMaybe<number>>()

/* Importing both under the bare name is what breaks — see collision-clash.ts. */

/* Via the root entry, the lowercase namespace holds the type, so both are
   reachable with no aliasing at all. */
import { Maybe as RootMaybe, maybe } from './root.js'

export const viaRoot: maybe.Maybe<number> = RootMaybe.from(3).unwrap()
expectTypeOf(maybe.map).toBeFunction()
