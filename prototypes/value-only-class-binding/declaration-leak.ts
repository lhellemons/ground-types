/**
 * PROTOTYPE — throwaway. The one file that is *supposed* to fail.
 *
 * Isolated because TS4094 is a declaration-emit error, and `@ts-expect-error`
 * does not suppress those — so it cannot be pinned inline the way every other
 * claim in this prototype is. `run.mjs` compiles this file on its own and
 * asserts the error appears.
 *
 * Expected: TS4094 — Property 'value' of exported anonymous class type may
 * not be private or protected.
 */
import { Maybe } from './maybe-box.js'

export const leaked = Maybe.from(3)
