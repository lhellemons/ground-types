/**
 * PROTOTYPE — throwaway. Stands in for `src/fn/box.ts`.
 *
 * `Fn` boxes a *function* rather than a value, so it is the second shape the
 * map's decision 2 claims can share one primitive. Included to check that
 * nothing about the value-only binding depends on boxing a plain value.
 */
import type { Mapper } from '../../src/fn/index.js'

class FnBox<A, B> {
  private constructor(private readonly f: Mapper<A, B>) {}

  static of<A, B>(f: Mapper<A, B>): FnBox<A, B> {
    return new FnBox(f)
  }

  map<C>(g: Mapper<B, C>): FnBox<A, C> {
    return new FnBox((a: A) => g(this.f(a)))
  }

  /** Terminal out — hands back a plain function. */
  unwrap(): Mapper<A, B> {
    return this.f
  }
}

export const Fn = FnBox
