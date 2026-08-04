import { describe, expect, it } from 'vitest'
import * as promiseFake from '../../src/promise/fake.js'

/**
 * Pins `/promise/fake`'s runtime export names. `scripts/assert-exports-resolve.mjs`
 * proves the built subpath resolves and imports; it says nothing about a
 * symbol being added, removed or renamed along the way, which is what this
 * file exists to catch. Imports from source rather than `dist` so it runs
 * under plain vitest without a build. Neither export is type-only, so no
 * companion `.test-d.ts` is needed for this module.
 *
 * To change intentionally: add/remove/rename the export in
 * `src/promise/fake.ts`, update the list below to match, and update the
 * README's module table (owned separately).
 */
describe('/promise/fake runtime exports', () => {
  it('exports exactly this set of names', () => {
    expect(Object.keys(promiseFake).sort((a, b) => a.localeCompare(b))).toEqual(
      ['fakeAbortablePromise', 'fakePromise'],
    )
  })
})
