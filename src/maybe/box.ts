/* The class is declared privately and exported as a value binding only, so
   the instance type has no spellable name: `Maybe` in type position resolves
   to the unboxed alias below. Only `export const` plus a locally declared
   type alias produces that split — the tidier-looking matched export clauses
   (`export { MaybeBox as Maybe }` + `export type { ... as Maybe }`) fail,
   and fail in the direction that hands the *class* the type meaning. See
   docs/adr/0005-box-classes.md. */

import type { Just, Nothing } from './index.js'
import type { NotAPromise, Result } from '../result/index.js'

/**
 * The unboxed type, under the capitalised name: `Maybe<T>` written in type
 * position is `./index.js`'s `Maybe<T>`, never the Box. One name, both
 * meanings — the class below in value position, this alias in type
 * position.
 */
export type Maybe<T> = import('./index.js').Maybe<T>

/** The held type when it is provably present. */
type Present<R> = Just<Exclude<R, undefined>>

/**
 * What `map`/`andThen` hold afterwards: the callback's return joined with
 * whatever `Nothing` arm the input still had — so a Box known to hold a
 * `Just` maps to a Box known to hold a `Just`.
 */
type Mapped<R, U> = [Exclude<R, undefined>] extends [never]
  ? Nothing<U>
  : U | Extract<R, undefined>

/** Every member throws: the surface is pinned ahead of its implementation. */
function notImplemented(..._args: unknown[]): never {
  throw new Error(
    'Not implemented — the Box surface is pinned, not built; see docs/adr/0005-box-classes.md',
  )
}

/**
 * The Maybe Box: a transient chain builder over an unboxed `Maybe` (see
 * CONTEXT.md's Box entry). Enter through a static factory, chain, and leave
 * through a terminal — `unbox()` or `.value`. A Box is parameterised by the
 * unboxed type it holds, so every member's return type is its `/maybe`
 * counterpart's, or a narrowing of it, and never stores or travels:
 * everything stored or passed stays unboxed
 * (docs/adr/0005-box-classes.md).
 */
class MaybeBox<R> {
  private constructor() {
    /* Instances come only from the static factories. */
  }

  /** Boxes a possibly-absent value: the counterpart of `maybe()`. */
  static from<T>(value: T | undefined): MaybeBox<Maybe<T>> {
    return notImplemented(value)
  }

  /**
   * Boxes a value from a null-convention API, folding `null` into
   * `Nothing` — the counterpart of `maybe/fromNullable`.
   */
  static fromNullable<T>(
    value: T | null | undefined,
  ): MaybeBox<Maybe<NonNullable<T>>> {
    return notImplemented(value)
  }

  /** Boxes a known-present value as a `Just` — the counterpart of `just`. */
  static just<T>(value: T): MaybeBox<Just<T>> {
    return notImplemented(value)
  }

  /**
   * Boxes the absent case for a given `T`. Holds `Maybe<T>`, not
   * `Nothing<T>` — `Nothing<T>` erases its `T`, which would leave
   * `orElse`/`fallback` uncallable on the result.
   */
  static nothing<T>(): MaybeBox<Maybe<T>> {
    return notImplemented()
  }

  /**
   * Boxes a `Result`, discarding the error — the counterpart of
   * `maybe/fromResult`. The runtime check is inlined, keeping the Box
   * modules free of a runtime maybe/result cycle
   * (docs/adr/0001-unboxed-maybe-and-result.md).
   */
  static fromResult<T, E extends Error = Error>(
    value: Result<T, E>,
  ): MaybeBox<Maybe<T>> {
    return notImplemented(value)
  }

  /** @deprecated `isJust` asks about a value, not a Box — use `box.isJust()`. */
  static isJust(value: MaybeBox<unknown>): never
  /** Type guard over an unboxed value — the counterpart of `maybe/isJust`. */
  static isJust<T>(value: Maybe<T>): value is Just<T>
  static isJust<T>(value: MaybeBox<unknown> | Maybe<T>): boolean {
    return notImplemented(value)
  }

  /** @deprecated `isNothing` asks about a value, not a Box — use `box.isNothing()`. */
  static isNothing(value: MaybeBox<unknown>): never
  /** Type guard over an unboxed value — the counterpart of `maybe/isNothing`. */
  static isNothing<T>(value: Maybe<T>): value is Nothing<T>
  static isNothing<T>(value: MaybeBox<unknown> | Maybe<T>): boolean {
    return notImplemented(value)
  }

  /**
   * Asserts an unboxed value is present, returning it as a `Just` or
   * throwing — the counterpart of `maybe/assertJust`.
   */
  static assertJust<T>(value: Maybe<T>, message?: string): Just<T> {
    return notImplemented(value, message)
  }

  /**
   * Applies `fn` to a held `Just`, passing a held `Nothing` through — the
   * counterpart of `maybe/map`, tracking the held arms: a Box holding a
   * `Just` maps to a Box holding a `Just`.
   */
  map<U extends NotAPromise<U>>(
    fn: (value: Present<R>) => U,
  ): MaybeBox<Mapped<R, U>> {
    return notImplemented(fn)
  }

  /**
   * The linear-chaining form, kept for symmetry with the Result Box —
   * the counterpart of `maybe/andThen`, and like it a `map` in all but
   * name: nothing ever flattens
   * (docs/adr/0001-unboxed-maybe-and-result.md).
   */
  andThen<U extends NotAPromise<U>>(
    fn: (value: Present<R>) => U,
  ): MaybeBox<Mapped<R, U>> {
    return notImplemented(fn)
  }

  /**
   * Substitutes an eager default for a held `Nothing`, so the Box holds a
   * `Just` and says so — the counterpart of `maybe/orElse`.
   */
  orElse(defaultValue: Present<R>): MaybeBox<Present<R>> {
    return notImplemented(defaultValue)
  }

  /**
   * Lazy counterpart of {@link orElse}: `fn` runs only when the held value
   * is `Nothing` — the counterpart of `maybe/fallback`.
   */
  fallback(fn: () => Present<R>): MaybeBox<Present<R>> {
    return notImplemented(fn)
  }

  /**
   * Asserts the held value is present, so the chain continues over a
   * `Just` — the counterpart of `maybe/assertJust`, as a chaining member
   * rather than a terminal.
   */
  assertJust(message?: string): MaybeBox<Present<R>> {
    return notImplemented(message)
  }

  /**
   * Instance predicate: narrows this Box to one holding a `Just`. Applies
   * in the guarded branch only — `else` does not narrow; use
   * {@link isNothing} there.
   */
  isJust(): this is MaybeBox<Exclude<R, undefined>> {
    return notImplemented()
  }

  /** Instance predicate: narrows this Box to one holding a `Nothing`. */
  isNothing(): this is MaybeBox<Extract<R, undefined>> {
    return notImplemented()
  }

  /**
   * Acts on the whole held value — runs `fn` for its side effect and hands
   * this Box back unchanged, return value discarded (see CONTEXT.md's Act
   * entry). The counterpart of `maybe/act`. `fn` must resolve
   * synchronously; a thenable return is a compile error.
   */
  act<S extends NotAPromise<S>>(fn: (value: R) => S): this {
    return notImplemented(fn)
  }

  /** Acts only when the held value is a `Just`, receiving it. */
  ifJust<S extends NotAPromise<S>>(fn: (value: Present<R>) => S): this {
    return notImplemented(fn)
  }

  /**
   * Acts only when the held value is `Nothing`. The callback takes no
   * argument — a `Nothing` carries nothing to inspect.
   */
  ifNothing<S extends NotAPromise<S>>(fn: () => S): this {
    return notImplemented(fn)
  }

  /** Terminal: hands back the held unboxed value. */
  unbox(): R
  /**
   * Terminal, folding: applies `fn` to the held value and hands back its
   * result. `unbox(undefined)` is an argument, not a zero-arg call
   * (docs/adr/0003-currying.md), and a compile error.
   */
  unbox<U>(fn: (value: R) => U): U
  unbox<U>(fn?: (value: R) => U): R | U {
    return notImplemented(fn)
  }

  /** Terminal: the held unboxed value, as a property read. */
  get value(): R {
    return notImplemented()
  }
}

export const Maybe = MaybeBox
