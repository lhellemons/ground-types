import { describe, expect, it } from 'vitest'
import * as result from '../../src/result/index.js'

/**
 * Pins `/result`'s runtime export names. `scripts/assert-exports-resolve.mjs`
 * proves the built subpath resolves and imports; it says nothing about a
 * symbol being added, removed or renamed along the way, which is what this
 * file exists to catch. Imports from source rather than `dist` so it runs
 * under plain vitest without a build. `Result`, `Success`, `Failure`,
 * `NotAResult` and `NotAPromise` are type-only and so invisible here — see
 * `src/result/api-surface.test-d.ts`. `ThrownError` is a class, so it is a
 * runtime value and listed below even though it is also usable as a type.
 *
 * To change intentionally: add/remove/rename the export in
 * `src/result/index.ts`, update the list below to match, and update the
 * README's module table (owned separately).
 */
describe('/result runtime exports', () => {
  it('exports exactly this set of names', () => {
    expect(Object.keys(result).sort((a, b) => a.localeCompare(b))).toEqual([
      'andThen',
      'assertSuccess',
      'failure',
      'fallback',
      'fromMaybe',
      'isFailure',
      'isSuccess',
      'map',
      'mapError',
      'orElse',
      'result',
      'success',
      'ThrownError',
      'tryCatch',
    ])
  })
})
