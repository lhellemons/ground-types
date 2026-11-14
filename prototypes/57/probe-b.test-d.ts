/* PROTOTYPE #57 — Arm B's extra goal: a narrowed failure returns as-is. */
import { describe, expectTypeOf, it } from 'vitest'
import { isFailure, isSuccess, success } from './index.js'
import type { Result } from './index.js'

class Invalid extends Error {
  readonly code = 'invalid' as const
}
class Other extends Error {
  readonly code = 'other' as const
}
declare function step(): Result<number, Invalid>

describe('Arm B: return a narrowed failure as-is', () => {
  it('compiles into a Result with a different T and a wider E, no re-wrap', () => {
    const f = (): Result<string, Invalid | Other> => {
      const r = step()
      if (isFailure(r)) return r
      return success(String(r))
    }
    expectTypeOf(f).returns.toEqualTypeOf<Result<string, Invalid | Other>>()
  })

  it('the false branch of isFailure still narrows to the Success', () => {
    const r = step()
    if (!isFailure(r)) {
      expectTypeOf(r).toExtend<number>()
      const n: number = r
      void n
    }
  })

  it('the false branch of isSuccess still narrows to the Failure', () => {
    const r = step()
    if (!isSuccess(r)) {
      expectTypeOf(r).toExtend<Invalid>()
    }
  })
})
