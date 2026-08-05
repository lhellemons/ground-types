/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
/**
 * PROTOTYPE — throwaway, for `prototypes/root-export-bundle-cost` only.
 *
 * The member *inventory* is faithful to issue #43; the *types* are not —
 * they are erased before a bundler ever sees this file, so only the emitted
 * JavaScript matters here. The real surface is pinned in
 * `prototype/maybe-box-surface`.
 */
import {
  andThen,
  assertJust,
  fallback,
  fromNullable,
  fromResult,
  isJust,
  isNothing,
  just,
  map,
  maybe,
  nothing,
  orElse,
} from './index.js'

class MaybeBox<R> {
  private constructor(private readonly held: R) {}

  private static of<S>(held: S): MaybeBox<S> {
    return new MaybeBox(held)
  }

  static from<T>(value: T | undefined): MaybeBox<any> {
    return MaybeBox.of(maybe(value))
  }

  static just<T>(value: T): MaybeBox<any> {
    return MaybeBox.of(just(value))
  }

  static nothing<T>(): MaybeBox<any> {
    return MaybeBox.of(nothing<T>())
  }

  static fromNullable<T>(value: T | null | undefined): MaybeBox<any> {
    return MaybeBox.of(fromNullable(value))
  }

  static fromResult<T>(value: any): MaybeBox<any> {
    return MaybeBox.of(fromResult<T>(value))
  }

  static isJust(value: any): boolean {
    return isJust(value)
  }

  static isNothing(value: any): boolean {
    return isNothing(value)
  }

  map(fn: (value: any) => any): MaybeBox<any> {
    return MaybeBox.of(map(fn, this.held as any))
  }

  andThen(fn: (value: any) => any): MaybeBox<any> {
    return MaybeBox.of(andThen(fn, this.held as any))
  }

  orElse(defaultValue: any): MaybeBox<any> {
    return MaybeBox.of(orElse(defaultValue, this.held as any))
  }

  fallback(fn: () => any): MaybeBox<any> {
    return MaybeBox.of(fallback(fn, this.held as any))
  }

  assertJust(message?: string): MaybeBox<any> {
    return MaybeBox.of(assertJust(this.held as any, message))
  }

  isJust(): boolean {
    return isJust(this.held as any)
  }

  isNothing(): boolean {
    return isNothing(this.held as any)
  }

  act(fn: (value: any) => void): MaybeBox<R> {
    fn(this.held)
    return this
  }

  ifJust(fn: (value: any) => void): MaybeBox<R> {
    if (isJust(this.held as any)) {
      fn(this.held)
    }
    return this
  }

  ifNothing(fn: () => void): MaybeBox<R> {
    if (isNothing(this.held as any)) {
      fn()
    }
    return this
  }

  unbox(fn?: (value: any) => any): any {
    return fn === undefined ? this.held : map(fn, this.held as any)
  }

  get value(): R {
    return this.held
  }
}

export const Maybe = MaybeBox
