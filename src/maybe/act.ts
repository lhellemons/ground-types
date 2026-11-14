/* The act family (see CONTEXT.md's Act entry), pinned ahead of its
   implementation. Deliberately unwired: not re-exported from `./index.ts`
   and reachable through no subpath, so the package a consumer installs is
   unchanged until the implementation effort lands, re-exports these from
   `/maybe`, and extends the api-surface pins
   (docs/adr/0005-box-classes.md). */

import type { Maybe } from './index.js'
import type { NotAPromise } from '../result/index.js'

/** The act helpers throw until the surface is implemented (ADR 0005). */
function notImplemented(..._args: unknown[]): never {
  throw new Error(
    'Not implemented — the act surface is pinned, not built; see docs/adr/0005-box-classes.md',
  )
}

/**
 * Acts on the passing value: runs `fn` for its side effect and hands the
 * value back unchanged, `fn`'s return discarded (see CONTEXT.md's Act
 * entry). `fn` receives the whole `Maybe<T>`, either case. The conditional
 * forms are {@link ifJust} and {@link ifNothing}.
 *
 * `fn` must resolve synchronously — see `NotAPromise`. Deliberate
 * fire-and-forget stays expressible: `act((v) => { void track(v) })`.
 *
 * Curryable: supply `value` to apply now, or omit it for a Mapper — decided
 * by arity, never by inspecting the value (see docs/adr/0003-currying.md).
 * Unlike `map`'s, the unapplied form stays generic: `T` binds at the
 * eventual application, so one `act(log)` slots into chains over any value
 * type.
 */
export function act<R extends NotAPromise<R>, T>(
  fn: (value: Maybe<T>) => R,
  value: T | undefined,
): Maybe<T>
export function act<A, R extends NotAPromise<R>>(
  fn: (value: A) => R,
): <T>(value: Maybe<T> & A) => Maybe<T>
export function act(...args: unknown[]): unknown {
  return notImplemented(...args)
}

/**
 * Acts only when the value is a `Just`, receiving it — otherwise the
 * `Nothing` passes through untouched and `fn` never runs. See {@link act}
 * for the family's contract, and CONTEXT.md's Act entry.
 *
 * Curryable: supply `value` to apply now, or omit it for a Mapper — decided
 * by arity, never by inspecting the value (see docs/adr/0003-currying.md).
 */
export function ifJust<A, R extends NotAPromise<R>, T extends A>(
  fn: (value: A) => R,
  value: T | undefined,
): Maybe<T>
export function ifJust<A, R extends NotAPromise<R>>(
  fn: (value: A) => R,
): <T extends A>(value: Maybe<T>) => Maybe<T>
export function ifJust(...args: unknown[]): unknown {
  return notImplemented(...args)
}

/**
 * Acts only when the value is `Nothing` — `fn` takes no argument, since a
 * `Nothing` carries nothing to inspect (compare `fallback`'s
 * `fn: () => T`). See {@link act} for the family's contract, and
 * CONTEXT.md's Act entry.
 *
 * Curryable: supply `value` to apply now, or omit it for a Mapper — decided
 * by arity, never by inspecting the value (see docs/adr/0003-currying.md).
 */
export function ifNothing<T, R extends NotAPromise<R>>(
  fn: () => R,
  value: T | undefined,
): Maybe<T>
export function ifNothing<R extends NotAPromise<R>>(
  fn: () => R,
): <T>(value: Maybe<T>) => Maybe<T>
export function ifNothing(...args: unknown[]): unknown {
  return notImplemented(...args)
}
