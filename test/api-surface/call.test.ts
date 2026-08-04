import { describe, expect, it } from 'vitest'
import * as call from '../../src/call/index.js'

/**
 * Pins `/call`'s runtime export names. `scripts/assert-exports-resolve.mjs`
 * proves the built subpath resolves and imports; it says nothing about a
 * symbol being added, removed or renamed along the way, which is what this
 * file exists to catch. Imports from source rather than `dist` so it runs
 * under plain vitest without a build. `Call`, `AsyncCall` and
 * `AbortableCall` are type-only and so invisible here — see
 * `src/call/api-surface.test-d.ts`.
 *
 * To change intentionally: add/remove/rename the export in
 * `src/call/index.ts`, update the list below to match, and update the
 * README's module table (owned separately).
 */
describe('/call runtime exports', () => {
  it('exports exactly this set of names', () => {
    expect(Object.keys(call).sort((a, b) => a.localeCompare(b))).toEqual([
      'abortable',
      'resultify',
    ])
  })
})
