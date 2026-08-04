/**
 * PROTOTYPE — throwaway. Variant A: the naive cycle.
 *
 * `maybe/box` imports `result/box`'s class as a runtime value and vice versa
 * — the exact shape ADR 0001 forbids between `maybe` and `result`. The other
 * class is touched only inside a method body, never while the module itself
 * is evaluating.
 *
 * Bodies are deliberately sloppy. Only the module graph and the types are
 * being proven.
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

  /**
   * Bridge IN — and it needs no import of `result` at all. The argument is an
   * unboxed `Result`, a plain value, so the runtime check inlines exactly as
   * `maybe/fromResult` already inlines it.
   */
  static fromResult<T, E extends Error>(value: ResultValue<T, E>): MaybeBox<T> {
    return new MaybeBox(
      (value instanceof Error ? undefined : value) as T | undefined,
    )
  }

  map<U>(f: (value: T) => U): MaybeBox<U> {
    return new MaybeBox<U>(
      isJust(this.held as MaybeValue<T>) ? f(this.held as T) : undefined,
    )
  }

  /**
   * Bridge ACROSS — the one member that needs the other CLASS, a runtime
   * value. Its return type is spelled through the hatch #38 left open: the
   * instance type has no name, but a static factory's return type recovers
   * it.
   */
  toResult<E extends Error>(error: E): ReturnType<typeof Result.from<T, E>> {
    return Result.from<T, E>(
      (this.held === undefined ? error : this.held) as ResultValue<T, E>,
    )
  }

  get value(): MaybeValue<T> {
    return this.held as MaybeValue<T>
  }
}

export const Maybe = MaybeBox
