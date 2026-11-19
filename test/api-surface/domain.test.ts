import { describe, expect, it } from 'vitest'
import * as domain from '../../src/domain/index.js'

/**
 * Pins `/domain`'s runtime export names. `scripts/assert-exports-resolve.mjs`
 * proves the built subpath resolves and imports; it says nothing about a
 * symbol being added, removed or renamed along the way, which is what this
 * file exists to catch. Imports from source rather than `dist` so it runs
 * under plain vitest without a build. `DomainError` is a class, so it is a
 * runtime value even though it is also usable as a type. `Entity`,
 * `CompoundValueObject`, `DTOSource`, `DomainObjectFactory`, `ErrorDTO` and
 * `JSONValue` are type-only; their pins live in
 * `src/domain/api-surface.test-d.ts`.
 *
 * To change intentionally: add/remove/rename the export in
 * `src/domain/index.ts`, update the list below and the companion type pins
 * to match, and update the README's module table.
 */
describe('/domain runtime exports', () => {
  it('exports exactly this set of names', () => {
    expect(Object.keys(domain).sort((a, b) => a.localeCompare(b))).toEqual([
      'DomainError',
    ])
  })
})
