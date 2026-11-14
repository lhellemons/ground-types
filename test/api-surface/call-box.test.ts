import { describe, expect, it } from 'vitest'
import * as callBox from '../../src/call/box.js'

/**
 * Pins `/call/box`'s runtime export names — the class binding and nothing
 * else; `NotAbortable` is type-only and so invisible here, pinned by
 * message string in `src/call/box.test-d.ts` instead.
 */
describe('/call/box runtime exports', () => {
  it('exports exactly the class binding', () => {
    expect(Object.keys(callBox).sort((a, b) => a.localeCompare(b))).toEqual([
      'Call',
    ])
  })
})
