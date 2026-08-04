/**
 * PROTOTYPE — throwaway. Variant B: the same cycle as A, except one class
 * touches the other while its own module is still EVALUATING — here, a static
 * field initialiser. This is the case the TDZ can bite.
 */
import { isJust } from '../../../src/maybe/index.js'
import type { Maybe as MaybeValue } from '../../../src/maybe/index.js'
import type { Result as ResultValue } from '../../../src/result/index.js'
import { Result } from './result-box.js'

class MaybeBox<T> {
  private constructor(private readonly held: T | undefined) {}

  static from<T>(value: T | undefined): MaybeBox<T> {
    return new MaybeBox(value)
  }

  toResult<E extends Error>(error: E): ReturnType<typeof Result.from<T, E>> {
    return Result.from<T, E>(
      (isJust(this.held as MaybeValue<T>) ? this.held : error) as ResultValue<
        T,
        E
      >,
    )
  }

  get value(): MaybeValue<T> {
    return this.held as MaybeValue<T>
  }
}

export const Maybe = MaybeBox
