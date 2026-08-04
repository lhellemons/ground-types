/**
 * PROTOTYPE — throwaway. The other half of variant E. Symmetric with
 * `maybe-box.ts`: type-only knowledge of the other side, nothing at runtime.
 */
import { isSuccess } from '../../../src/result/index.js'
import type { Result as ResultValue } from '../../../src/result/index.js'
/**
 * Type-only, and that is the finding: a parameter typed as the other Box is
 * free. `Maybe` is a value binding, but `typeof Maybe.from` is a type query,
 * so `verbatimModuleSyntax` erases this import entirely. Only CONSTRUCTING
 * the other Box needs it at runtime.
 */
import type { Maybe } from './maybe-box.js'

class ResultBox<T, E extends Error> {
  private constructor(private readonly held: ResultValue<T, E>) {}

  static from<T, E extends Error = Error>(
    value: ResultValue<T, E>,
  ): ResultBox<T, E> {
    return new ResultBox(value)
  }

  /**
   * Takes the other Box directly rather than its unboxed value. Costs no
   * runtime import — but saves only the `.value` the caller would have
   * spelled, so it is an ergonomic rounding error, not a crossing.
   */
  static fromBox<T, E extends Error>(
    error: E,
    box: ReturnType<typeof Maybe.from<T>>,
  ): ResultBox<T, E> {
    return ResultBox.fromMaybe<T, E>(error, box.value as T | undefined)
  }

  /** `result/fromMaybe`, as a member. Inlined check, no import. */
  static fromMaybe<T, E extends Error>(
    error: E,
    value: T | undefined,
  ): ResultBox<T, E> {
    return new ResultBox(
      (value === undefined ? error : value) as ResultValue<T, E>,
    )
  }

  map<U>(f: (value: T) => U): ResultBox<U, E> {
    return new ResultBox<U, E>(
      (isSuccess(this.held) ? f(this.held as T) : this.held) as ResultValue<
        U,
        E
      >,
    )
  }

  get result(): ResultValue<T, E> {
    return this.held
  }
}

export const Result = ResultBox
