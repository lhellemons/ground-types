/* The act family (see CONTEXT.md's Act entry), pinned ahead of its
   implementation. Deliberately unwired: not re-exported from `./index.ts`
   and reachable through no subpath, so the package a consumer installs is
   unchanged until the implementation effort lands, re-exports these from
   `/result`, and extends the api-surface pins
   (docs/adr/0005-box-classes.md). */

import type { NotAPromise, Result } from './index.js'

/** The act helpers throw until the surface is implemented (ADR 0005). */
function notImplemented(..._args: unknown[]): never {
  throw new Error(
    'Not implemented — the act surface is pinned, not built; see docs/adr/0005-box-classes.md',
  )
}

/**
 * Acts on the passing value: runs `fn` for its side effect and hands the
 * value back unchanged, `fn`'s return discarded (see CONTEXT.md's Act
 * entry). `fn` receives the whole `Result<T, E>`, either case. The
 * conditional forms are {@link ifSuccess} and {@link ifFailure}.
 *
 * `fn` must resolve synchronously — see `NotAPromise`. Deliberate
 * fire-and-forget stays expressible: `act((v) => { void track(v) })`.
 *
 * Curryable: supply `value` to apply now, or omit it for a Mapper — decided
 * by arity, never by inspecting the value (see docs/adr/0003-currying.md).
 * Like `map`, the unapplied form stays generic: `T` and `E` bind at the
 * eventual application, so one `act(log)` slots into chains over any error
 * type.
 */
export function act<R extends NotAPromise<R>, T, E extends Error>(
  fn: (value: Result<T, E>) => R,
  value: Result<T, E>,
): Result<T, E>
export function act<A, R extends NotAPromise<R>>(
  fn: (value: A) => R,
): <T, E extends Error = Error>(value: Result<T, E> & A) => Result<T, E>
export function act(...args: unknown[]): unknown {
  return notImplemented(...args)
}

/**
 * Acts only when the value is a `Success`, receiving it — otherwise the
 * `Failure` passes through untouched and `fn` never runs. See {@link act}
 * for the family's contract, and CONTEXT.md's Act entry.
 *
 * Curryable: supply `value` to apply now, or omit it for a Mapper — decided
 * by arity, never by inspecting the value (see docs/adr/0003-currying.md).
 */
export function ifSuccess<
  A,
  R extends NotAPromise<R>,
  T extends A,
  E extends Error,
>(fn: (value: A) => R, value: Result<T, E>): Result<T, E>
export function ifSuccess<A, R extends NotAPromise<R>>(
  fn: (value: A) => R,
): <T extends A, E extends Error = Error>(value: Result<T, E>) => Result<T, E>
export function ifSuccess(...args: unknown[]): unknown {
  return notImplemented(...args)
}

/**
 * Acts only when the value is a `Failure`, receiving its error — otherwise
 * the `Success` passes through untouched and `fn` never runs. The error
 * parameter narrows like `mapError`'s: a handler for an error class the
 * chain cannot carry is a compile error. See {@link act} for the family's
 * contract, and CONTEXT.md's Act entry.
 *
 * Curryable: supply `value` to apply now, or omit it for a Mapper — decided
 * by arity, never by inspecting the value (see docs/adr/0003-currying.md).
 */
export function ifFailure<
  A extends Error,
  R extends NotAPromise<R>,
  T,
  E extends A,
>(fn: (error: A) => R, value: Result<T, E>): Result<T, E>
export function ifFailure<A extends Error, R extends NotAPromise<R>>(
  fn: (error: A) => R,
): <T, E extends A>(value: Result<T, E>) => Result<T, E>
export function ifFailure(...args: unknown[]): unknown {
  return notImplemented(...args)
}
