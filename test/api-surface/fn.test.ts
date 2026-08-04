import { describe, expect, it } from 'vitest'
import * as fn from '../../src/fn/index.js'

/**
 * Pins `/fn`'s runtime export names. `scripts/assert-exports-resolve.mjs`
 * proves the built subpath resolves and imports; it says nothing about a
 * symbol being added, removed or renamed along the way, which is what this
 * file exists to catch. Imports from source rather than `dist` so it runs
 * under plain vitest without a build. `Fn`, `Mapper` and `CurryableMapper`
 * are type-only and so invisible here — see `src/fn/api-surface.test-d.ts`.
 *
 * To change intentionally: add/remove/rename the export in
 * `src/fn/index.ts`, update the list below to match, and update the
 * README's module table (owned separately).
 */
describe('/fn runtime exports', () => {
  it('exports exactly this set of names', () => {
    expect(Object.keys(fn).sort((a, b) => a.localeCompare(b))).toEqual([
      'compose',
      'constant',
      'curry',
      'identity',
      'pipe',
    ])
  })
})
