/**
 * PROTOTYPE — throwaway. Stands in for the root entry (`src/index.ts`) once
 * map decision 4 lands: the Box classes re-exported at the root alongside the
 * existing lowercase namespaces.
 */
export * as maybe from '../../src/maybe/index.js'
export * as fn from '../../src/fn/index.js'
export { Maybe } from './maybe-box.js'
export { Fn } from './fn-box.js'
