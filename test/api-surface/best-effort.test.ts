import { describe, expect, it } from 'vitest'
import * as bestEffort from '../../src/best-effort/index.js'

/**
 * Pins `/best-effort`'s runtime export names.
 * `scripts/assert-exports-resolve.mjs` proves the built subpath resolves and
 * imports; it says nothing about a symbol being added, removed or renamed
 * along the way, which is what this file exists to catch. Imports from
 * source rather than `dist` so it runs under plain vitest without a build.
 * `BestEffort` and `NotABestEffort` are type-only and so invisible here —
 * see `src/best-effort/api-surface.test-d.ts`.
 *
 * To change intentionally: add/remove/rename the export in
 * `src/best-effort/index.ts`, update the list below to match, and update the
 * README's module table.
 */
describe('/best-effort runtime exports', () => {
  it('exports exactly this set of names', () => {
    expect(Object.keys(bestEffort).sort((a, b) => a.localeCompare(b))).toEqual([
      'andThen',
      'bestEffort',
      'gather',
      'map',
      'note',
      'recover',
      'recoverWith',
      'toResult',
    ])
  })
})
