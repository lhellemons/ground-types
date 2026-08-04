/**
 * PROTOTYPE — throwaway. Variant A′: variant A with the cross-Box return type
 * left to inference instead of spelled through the `ReturnType` hatch.
 *
 * This is compiled by its own tsconfig, because it is expected to FAIL
 * declaration emit: `maybe/box.d.ts` would have to name `ResultBox`, and
 * decision 5 says no module exports that name.
 */
import type { Result as ResultValue } from '../../../src/result/index.js'
import { Result } from './result-box.js'

class MaybeBox<T> {
  private constructor(private readonly held: T | undefined) {}

  static from<T>(value: T | undefined): MaybeBox<T> {
    return new MaybeBox(value)
  }

  /** No return type annotation — the emitter has to name the other class. */
  toResult<E extends Error>(error: E) {
    return Result.from<T, E>(
      (this.held === undefined ? error : this.held) as ResultValue<T, E>,
    )
  }
}

export const Maybe = MaybeBox
