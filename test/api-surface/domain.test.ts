import { describe, expect, it } from 'vitest'
import * as domain from '../../src/domain/index.js'

/**
 * Pins `/domain`'s runtime export surface: none. `Entity`,
 * `CompoundValueObject`, `DTOSource` and `DomainObjectFactory` are all
 * type-only, so the module erases to an empty JS file at build time.
 * `scripts/assert-exports-resolve.mjs` proves the built subpath resolves
 * and imports; it says nothing about a runtime value being added later,
 * which is what this file exists to catch. See
 * `src/domain/api-surface.test-d.ts` for the type-only pins.
 */
describe('/domain runtime exports', () => {
  it('exports nothing at runtime', () => {
    expect(Object.keys(domain)).toEqual([])
  })
})
