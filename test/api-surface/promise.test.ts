import { describe, expect, it } from 'vitest'
import * as promise from '../../src/promise/index.js'

/**
 * Pins `/promise`'s runtime export names. `scripts/assert-exports-resolve.mjs`
 * proves the built subpath resolves and imports; it says nothing about a
 * symbol being added, removed or renamed along the way, which is what this
 * file exists to catch. Imports from source rather than `dist` so it runs
 * under plain vitest without a build. `AbortContext`, `Initial`, `Pending`,
 * `Fulfilled`, `Rejected`, `Settled`, `State` and `TrackedState` are
 * type-only and so invisible here — see
 * `src/promise/api-surface.test-d.ts`. `AbortablePromise` and
 * `RejectionError` are classes, so they are runtime values and listed
 * below even though both are also usable as types. `fakePromise` and
 * `fakeAbortablePromise` deliberately do not appear: `/promise/fake` is a
 * separate subpath precisely so a test double cannot reach a production
 * bundle by accident — see `promise-fake.test.ts` and `root.test.ts`.
 *
 * To change intentionally: add/remove/rename the export in
 * `src/promise/index.ts` (or one of the files it re-exports from), update
 * the list below to match, and update the README's module table (owned
 * separately).
 */
describe('/promise runtime exports', () => {
  it('exports exactly this set of names', () => {
    expect(Object.keys(promise).sort((a, b) => a.localeCompare(b))).toEqual([
      'AbortablePromise',
      'fail',
      'fulfilled',
      'initial',
      'isFulfilled',
      'isInitial',
      'isPending',
      'isRejected',
      'isSettled',
      'pending',
      'recoverWith',
      'rejected',
      'RejectionError',
      'resultify',
      'settledResult',
      'stateOf',
    ])
  })

  it('does not export the fake subpath', () => {
    expect(Object.prototype.hasOwnProperty.call(promise, 'fakePromise')).toBe(
      false,
    )
    expect(
      Object.prototype.hasOwnProperty.call(promise, 'fakeAbortablePromise'),
    ).toBe(false)
  })
})
