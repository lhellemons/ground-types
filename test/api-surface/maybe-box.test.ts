import { describe, expect, it } from 'vitest'
import * as maybeBox from '../../src/maybe/box.js'

/**
 * Pins `/maybe/box`'s runtime export names — the class binding and nothing
 * else; the type meaning of the same name, and the merged-name mechanism,
 * are pinned in `src/maybe/box.test-d.ts`. See
 * `test/api-surface/maybe.test.ts` for the convention's rationale.
 */
describe('/maybe/box runtime exports', () => {
  it('exports exactly the class binding', () => {
    expect(Object.keys(maybeBox).sort((a, b) => a.localeCompare(b))).toEqual([
      'Maybe',
    ])
  })
})
