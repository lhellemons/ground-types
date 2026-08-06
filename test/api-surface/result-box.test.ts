import { describe, expect, it } from 'vitest'
import * as resultBox from '../../src/result/box.js'

/**
 * Pins `/result/box`'s runtime export names — the class binding and nothing
 * else; the type meaning of the same name, and the merged-name mechanism,
 * are pinned in `src/result/box.test-d.ts`. See
 * `test/api-surface/result.test.ts` for the convention's rationale.
 */
describe('/result/box runtime exports', () => {
  it('exports exactly the class binding', () => {
    expect(Object.keys(resultBox).sort((a, b) => a.localeCompare(b))).toEqual([
      'Result',
    ])
  })
})
