/**
 * PROTOTYPE — throwaway. Variant E: no cross-Box members at all, in either
 * direction. Each class knows only the OTHER'S UNBOXED TYPE, which is erased,
 * so the emitted modules are as independent as `maybe/index` and
 * `result/index` are today.
 *
 * Both existing bridge helpers are still reachable as class members — as
 * statics, which is the direction that never needed an import.
 */
import { isJust } from '../../../src/maybe/index.js'
import type { Maybe as MaybeValue } from '../../../src/maybe/index.js'
import type { Result as ResultValue } from '../../../src/result/index.js'

class MaybeBox<T> {
  private constructor(private readonly held: T | undefined) {}

  static from<T>(value: T | undefined): MaybeBox<T> {
    return new MaybeBox(value)
  }

  /** `maybe/fromResult`, as a member. Inlined check, no import. */
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

  get value(): MaybeValue<T> {
    return this.held as MaybeValue<T>
  }
}

export const Maybe = MaybeBox
