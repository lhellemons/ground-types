import { describe, expect, it } from 'vitest'
import * as maybe from '../../src/maybe/index.js'

/**
 * Pins `/maybe`'s runtime export names. `scripts/assert-exports-resolve.mjs`
 * proves the built subpath resolves and imports; it says nothing about a
 * symbol being added, removed or renamed along the way, which is what this
 * file exists to catch. Imports from source rather than `dist` so it runs
 * under plain vitest without a build. `Maybe`, `Just` and `Nothing` are
 * type-only and so invisible here — see `src/maybe/api-surface.test-d.ts`.
 *
 * To change intentionally: add/remove/rename the export in
 * `src/maybe/index.ts`, update the list below to match, and update the
 * README's module table (owned separately).
 */
describe('/maybe runtime exports', () => {
  it('exports exactly this set of names', () => {
    expect(Object.keys(maybe).sort((a, b) => a.localeCompare(b))).toEqual([
      'andThen',
      'assertJust',
      'fallback',
      'fromNullable',
      'fromResult',
      'isJust',
      'isNothing',
      'just',
      'map',
      'maybe',
      'nothing',
      'orElse',
    ])
  })
})
