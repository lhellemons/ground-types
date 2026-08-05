/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment */
/**
 * PROTOTYPE — throwaway, for `prototypes/root-export-bundle-cost` only.
 *
 * Member inventory per issue #45. Types are erased before a bundler sees
 * this file; the real surface is pinned in `prototype/fn-call-box-surface`.
 */
import { compose, constant, identity, pipe } from './index.js'

class FnBox<R> {
  private constructor(private readonly held: R) {}

  private static of<S>(held: S): FnBox<S> {
    return new FnBox(held)
  }

  static from(fn: any): FnBox<any> {
    return FnBox.of(fn)
  }

  static identity<T>(): FnBox<any> {
    return FnBox.of(identity as (t: T) => T)
  }

  static constant<T>(t: T): FnBox<any> {
    return FnBox.of(constant(t))
  }

  pipe(...fns: any[]): FnBox<any> {
    const held = this.held as (...args: any[]) => any
    return FnBox.of((...args: any[]) => (pipe as any)(held(...args), ...fns))
  }

  compose(...fns: any[]): FnBox<any> {
    return FnBox.of((compose as any)(this.held, ...fns))
  }

  apply(...args: any[]): any {
    return (this.held as (...args: any[]) => any)(...args)
  }

  unbox(): R {
    return this.held
  }

  get fn(): R {
    return this.held
  }
}

export const Fn = FnBox
