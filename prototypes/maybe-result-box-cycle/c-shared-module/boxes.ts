/**
 * PROTOTYPE — throwaway. Variant C: one private module holding BOTH classes.
 * There is no cycle because there is no second module — the two classes are
 * siblings in one file, and each subpath is a one-line re-export of it.
 *
 * Stands in for a real `src/box/boxes.ts` (name not decided; the layering is
 * what is under test).
 */
import { isJust } from '../../../src/maybe/index.js'
import type { Maybe as MaybeValue } from '../../../src/maybe/index.js'
import { isSuccess } from '../../../src/result/index.js'
import type { Result as ResultValue } from '../../../src/result/index.js'

class MaybeBox<T> {
  private constructor(private readonly held: T | undefined) {}

  static from<T>(value: T | undefined): MaybeBox<T> {
    return new MaybeBox(value)
  }

  map<U>(f: (value: T) => U): MaybeBox<U> {
    return new MaybeBox<U>(
      isJust(this.held as MaybeValue<T>) ? f(this.held as T) : undefined,
    )
  }

  /** No hatch needed: the sibling class is in scope, spellable by name. */
  toResult<E extends Error>(error: E): ResultBox<T, E> {
    return ResultBox.from<T, E>(
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

class ResultBox<T, E extends Error> {
  private constructor(private readonly held: ResultValue<T, E>) {}

  /** The eager cross-class reference that variant B could not survive. */
  static readonly EMPTY = MaybeBox.from<never>(undefined)

  static from<T, E extends Error = Error>(
    value: ResultValue<T, E>,
  ): ResultBox<T, E> {
    return new ResultBox(value)
  }

  toMaybe(): MaybeBox<T> {
    return MaybeBox.from<T>(
      (isSuccess(this.held) ? this.held : undefined) as T | undefined,
    )
  }

  get result(): ResultValue<T, E> {
    return this.held
  }
}

export const Maybe = MaybeBox
export const Result = ResultBox
