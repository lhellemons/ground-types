/**
 * The root entry point: each module re-exported under a namespace named
 * after its subpath, camelCased where the subpath has a hyphen
 * (`intern-registry` -> `internRegistry`), so `maybe.map` and `result.map`
 * stay distinct here too. Per-module import remains the documented,
 * recommended style — see the "Modules" section of the README.
 *
 * `/promise/fake` is deliberately absent: it is a separate subpath
 * precisely so test doubles cannot reach a production bundle, and a
 * namespace here would defeat that.
 */
export * as abort from './abort/index.js'
export * as brand from './brand/index.js'
export * as call from './call/index.js'
export * as domain from './domain/index.js'
export * as fn from './fn/index.js'
export * as internRegistry from './intern-registry/index.js'
export * as maybe from './maybe/index.js'
export * as promise from './promise/index.js'
export * as result from './result/index.js'
export * as valueObject from './value-object/index.js'

/* The four Box classes, re-exported bare (see docs/adr/0005-box-classes.md
   and CONTEXT.md's Box entry). A re-export cannot select a meaning, so each
   name carries both: the Box class in value position and the module's
   unboxed type in type position. The rule this makes true everywhere:
   lowercase is the functional namespace, capitalised is the Box class. */
export { Call } from './call/box.js'
export { Fn } from './fn/box.js'
export { Maybe } from './maybe/box.js'
export { Result } from './result/box.js'
