/**
 * PROTOTYPE — throwaway. The other half of variant B. The eager reference is
 * `EMPTY`: a shared singleton, the most ordinary reason a class would touch
 * its sibling at module-evaluation time.
 */
import { isSuccess } from '../../../src/result/index.js'
import type { Result as ResultValue } from '../../../src/result/index.js'
import { Maybe } from './maybe-box.js'

class ResultBox<T, E extends Error> {
  private constructor(private readonly held: ResultValue<T, E>) {}

  /**
   * Evaluated when this module is evaluated, not when a method is called.
   * The annotation is not decoration: without it the emitter has to name
   * `MaybeBox`, and pass 2 shows what that costs.
   */
  static readonly EMPTY: ReturnType<typeof Maybe.from<never>> =
    Maybe.from<never>(undefined)

  static from<T, E extends Error = Error>(
    value: ResultValue<T, E>,
  ): ResultBox<T, E> {
    return new ResultBox(value)
  }

  toMaybe(): ReturnType<typeof Maybe.from<T>> {
    return Maybe.from<T>(
      (isSuccess(this.held) ? this.held : undefined) as T | undefined,
    )
  }

  get result(): ResultValue<T, E> {
    return this.held
  }
}

export const Result = ResultBox
