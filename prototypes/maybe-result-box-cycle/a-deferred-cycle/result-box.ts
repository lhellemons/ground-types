/**
 * PROTOTYPE — throwaway. The other half of variant A's cycle.
 */
import { isSuccess } from '../../../src/result/index.js'
import type { Result as ResultValue } from '../../../src/result/index.js'
import { Maybe } from './maybe-box.js'

class ResultBox<T, E extends Error> {
  private constructor(private readonly held: ResultValue<T, E>) {}

  static from<T, E extends Error = Error>(
    value: ResultValue<T, E>,
  ): ResultBox<T, E> {
    return new ResultBox(value)
  }

  /** Bridge IN — inlined check, no import of `maybe` needed. */
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

  /** Bridge ACROSS — needs the `Maybe` class as a runtime value. */
  toMaybe(): ReturnType<typeof Maybe.from<T>> {
    return Maybe.from<T>(
      (this.held instanceof Error ? undefined : this.held) as T | undefined,
    )
  }

  get result(): ResultValue<T, E> {
    return this.held
  }
}

export const Result = ResultBox
