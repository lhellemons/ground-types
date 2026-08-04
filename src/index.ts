/**
 * The root entry point. It exists so that a bare `import from
 * '@lhellemons/ground-types'` and tooling that ignores the `exports` map
 * (legacy `moduleResolution`, some bundler configs) both land somewhere,
 * per-module import remains the documented, recommended style — see the
 * "Modules" section of the README for why the modules are not flattened
 * into one namespace. Each module is re-exported under a namespace named
 * after its subpath, camelCased where the subpath has a hyphen
 * (`intern-registry` -> `internRegistry`), so `maybe.map` and `result.map`
 * stay distinct here too.
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
