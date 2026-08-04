import { describe, expect, it } from 'vitest'
import * as brand from '../../src/brand/index.js'

/**
 * Pins `/brand`'s runtime export surface: none. `Brand` and `Branded` are
 * both type-only, so the module erases to an empty JS file at build time —
 * this is the case the task that added this suite called out explicitly.
 * `scripts/assert-exports-resolve.mjs` proves the built subpath resolves
 * and imports; it says nothing about a runtime value being added later,
 * which is what this file exists to catch. See
 * `src/brand/api-surface.test-d.ts` for the type-only pins.
 */
describe('/brand runtime exports', () => {
  it('exports nothing at runtime', () => {
    expect(Object.keys(brand)).toEqual([])
  })
})
