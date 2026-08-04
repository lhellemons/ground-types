import { describe, expect, it } from 'vitest'
import * as groundTypes from '../../src/index.js'

/**
 * Pins the root entry point's namespace names. `scripts/assert-exports-resolve.mjs`
 * proves `"."` in `package.json`'s `exports` resolves and imports against the
 * built package; it says nothing about a namespace being added, removed or
 * renamed along the way, which is what this file exists to catch. Imports
 * from source rather than `dist` so it runs under plain vitest without a
 * build.
 *
 * To change intentionally: add/remove/rename the `export * as` line in
 * `src/index.ts`, update the list below to match, and update the README's
 * "Modules" section and root-entry-point paragraph (owned separately).
 */
describe('root entry point', () => {
  it('re-exports exactly this set of namespaces', () => {
    expect(Object.keys(groundTypes).sort((a, b) => a.localeCompare(b))).toEqual(
      [
        'abort',
        'brand',
        'call',
        'domain',
        'fn',
        'internRegistry',
        'maybe',
        'promise',
        'result',
        'valueObject',
      ],
    )
  })

  it('does not re-export /promise/fake — test doubles stay off the root', () => {
    // `/promise/fake` is a separate subpath precisely so a test double
    // cannot reach a production bundle by accident; a namespace here, or
    // fake's functions surfacing on the `promise` namespace, would defeat
    // that isolation. See README's "Modules" section.
    expect(Object.prototype.hasOwnProperty.call(groundTypes, 'fake')).toBe(
      false,
    )
    expect(
      Object.prototype.hasOwnProperty.call(groundTypes.promise, 'fakePromise'),
    ).toBe(false)
    expect(
      Object.prototype.hasOwnProperty.call(
        groundTypes.promise,
        'fakeAbortablePromise',
      ),
    ).toBe(false)
  })
})
