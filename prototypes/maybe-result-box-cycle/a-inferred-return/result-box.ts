/**
 * PROTOTYPE — throwaway. The other half of variant A′.
 */
import type { Result as ResultValue } from '../../../src/result/index.js'

class ResultBox<T, E extends Error> {
  private constructor(private readonly held: ResultValue<T, E>) {}

  static from<T, E extends Error = Error>(
    value: ResultValue<T, E>,
  ): ResultBox<T, E> {
    return new ResultBox(value)
  }

  get result(): ResultValue<T, E> {
    return this.held
  }
}

export const Result = ResultBox
