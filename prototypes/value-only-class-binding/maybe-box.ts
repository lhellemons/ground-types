/**
 * PROTOTYPE — throwaway. Stands in for `src/maybe/box.ts`.
 *
 * The mechanism under test: declare the class privately, export a `const`
 * bound to it. A `const` binds only a value, so no type binding named
 * `Maybe` escapes this module — while `typeof MaybeBox` keeps the whole
 * static side, generic factories included.
 *
 * Bodies are deliberately sloppy (casts, no edge cases, `!== undefined`
 * instead of the real `isJust`). Only the types are being proven.
 */
import type { Maybe as MaybeValue, Nothing } from '../../src/maybe/index.js'

class MaybeBox<T> {
  private constructor(private readonly value: T | undefined) {}

  /** Factory in — generic, must infer `T` from the argument. */
  static from<T>(value: T | undefined): MaybeBox<T> {
    return new MaybeBox<T>(value)
  }

  /** Second factory, to check inference on a bare `T`. */
  static just<T>(value: T): MaybeBox<T> {
    return new MaybeBox<T>(value)
  }

  /** Nullary factory — the case where `T` cannot be inferred at all. */
  static nothing<T>(): MaybeBox<T> {
    return new MaybeBox<T>(undefined)
  }

  map<U>(f: (value: T) => U): MaybeBox<U> {
    return MaybeBox.from<U>(
      this.value !== undefined ? f(this.value) : undefined,
    )
  }

  filter(predicate: (value: T) => boolean): MaybeBox<T> {
    return MaybeBox.from<T>(
      this.value !== undefined && predicate(this.value)
        ? this.value
        : undefined,
    )
  }

  /** Terminal out — leaves the Box, returning the unboxed encoding. */
  unwrap(): MaybeValue<T> {
    return this.value as MaybeValue<T>
  }

  /** Terminal out — the `Just` branch, so return types differ per terminal. */
  orElse(defaultValue: T): T {
    return this.value !== undefined ? this.value : defaultValue
  }
}

/**
 * The value-only export. No `export type Maybe` accompanies it, so the
 * instance type is unspellable from outside this module.
 */
export const Maybe = MaybeBox

/** Included only to prove a type export can sit alongside without clashing. */
export type MaybeBoxNothing<T> = Nothing<T>
