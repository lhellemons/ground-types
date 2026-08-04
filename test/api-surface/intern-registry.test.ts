import { describe, expect, it } from 'vitest'
import * as internRegistry from '../../src/intern-registry/index.js'

/**
 * Pins `/intern-registry`'s runtime export names. `scripts/assert-exports-resolve.mjs`
 * proves the built subpath resolves and imports; it says nothing about a
 * symbol being added, removed or renamed along the way, which is what this
 * file exists to catch. Imports from source rather than `dist` so it runs
 * under plain vitest without a build. Neither export is type-only, so no
 * companion `.test-d.ts` is needed for this module.
 *
 * To change intentionally: add/remove/rename the export in
 * `src/intern-registry/index.ts`, update the list below to match, and
 * update the README's module table (owned separately).
 */
describe('/intern-registry runtime exports', () => {
  it('exports exactly this set of names', () => {
    expect(
      Object.keys(internRegistry).sort((a, b) => a.localeCompare(b)),
    ).toEqual(['internByKey', 'InternRegistry'])
  })
})
