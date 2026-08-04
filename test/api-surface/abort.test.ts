import { describe, expect, it } from 'vitest'
import * as abort from '../../src/abort/index.js'

/**
 * Pins `/abort`'s runtime export names. `scripts/assert-exports-resolve.mjs`
 * proves the built subpath resolves and imports; it says nothing about a
 * symbol being added, removed or renamed along the way, which is what this
 * file exists to catch. Imports from source rather than `dist` so it runs
 * under plain vitest without a build. `AbortError` is a class, so it is a
 * runtime value and listed below even though it is also usable as a type;
 * this module has no other type-only export, so no companion
 * `.test-d.ts` is needed.
 *
 * To change intentionally: add/remove/rename the export in
 * `src/abort/index.ts`, update the list below to match, and update the
 * README's module table (owned separately).
 */
describe('/abort runtime exports', () => {
  it('exports exactly this set of names', () => {
    expect(Object.keys(abort).sort((a, b) => a.localeCompare(b))).toEqual([
      'ABORT_ERROR_NAME',
      'AbortError',
      'isAbortError',
    ])
  })
})
