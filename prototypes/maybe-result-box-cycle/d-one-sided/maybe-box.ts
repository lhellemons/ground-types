/**
 * PROTOTYPE — throwaway. Variant D: the bridges live on ONE side only.
 *
 * This module has no runtime import of `result` whatsoever — not the class,
 * not a guard — so ADR 0001's rule holds here unchanged. It still bridges IN
 * from a Result, because that direction never needed an import.
 *
 * What it does NOT have is `.toResult()`: mid-chain, crossing to a Result
 * means leaving the Box.
 */
import { isJust } from '../../../src/maybe/index.js'
import type { Maybe as MaybeValue } from '../../../src/maybe/index.js'
import type { Result as ResultValue } from '../../../src/result/index.js'

class MaybeBox<T> {
  private constructor(private readonly held: T | undefined) {}

  static from<T>(value: T | undefined): MaybeBox<T> {
    return new MaybeBox(value)
  }

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
