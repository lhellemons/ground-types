import { describe, expect, it } from 'vitest'
import * as fnBox from '../../src/fn/box.js'

/**
 * Pins `/fn/box`'s runtime export names — the class binding and nothing
 * else; `UnaryInput` and `NotAsync` are type-only and so invisible here,
 * pinned by message string in `src/fn/box.test-d.ts` instead.
 */
describe('/fn/box runtime exports', () => {
  it('exports exactly the class binding', () => {
    expect(Object.keys(fnBox).sort((a, b) => a.localeCompare(b))).toEqual([
      'Fn',
    ])
  })
})
