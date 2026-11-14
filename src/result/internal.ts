/* Module-private inference machinery shared by `/result` and `/result/box`.
   This file is deliberately absent from the package's exports map: it ships
   in `dist` so declaration emit can reference it, but a consumer cannot
   import it. Keeping the phantom-handle symbols and the `ValueOf`/`ErrorOf`
   readers here — rather than exporting them from `/result` — is what lets
   the Box class restate member types without widening the public surface. */

/* Inference handles. `Success`'s value sits behind a conditional type and
   `Failure`'s error behind an intersection, and TypeScript can infer through
   neither — which is why combinators that tried to pattern-match `Result<U, E>`
   at an inference site silently produced `unknown`. These optional markers give
   `ValueOf`/`ErrorOf` a plain position to `infer` from. Like `Result`'s
   `_phantom` they are compile-time only and never present on a value. */
export declare const _value: unique symbol
export declare const _error: unique symbol

/**
 * Recovers the value type carried by a `Success` arm, discarding any
 * `Failure` arms. Used to type a combinator's output from whatever its
 * callback actually returned, rather than inferring into `Result<U, E>`.
 */
export type ValueOf<R> =
  Exclude<R, Error> extends infer S
    ? S extends { readonly [_value]?: infer U }
      ? // A plain value carries no `_value` handle, so `U` infers as
        // `unknown`; fall back to the value's own type. Without this a
        // callback that cannot fail loses its Success type entirely.
        unknown extends U
        ? S
        : U
      : S
    : never

/**
 * Recovers the `Error` type carried by a `Failure` arm, if any.
 * Mirrors {@link ValueOf}'s fallback: a callback may return a raw `Error`
 * subclass instead of routing it through `failure()`, and that arm carries
 * no `_error` handle — without the fallback it would be dropped from the
 * error union entirely.
 */
export type ErrorOf<R> =
  Extract<R, Error> extends infer S
    ? S extends Error
      ? // A raw `Error` subclass matches neither the `_error` handle (weak
        // type detection rejects it — it shares no property with the marker)
        // nor `infer F`, so every path that isn't a real handle falls back
        // to `S`, which `Extract` already proved is an `Error`.
        S extends { readonly [_error]?: infer F }
        ? unknown extends F
          ? S
          : F extends Error
            ? F
            : S
        : S
      : never
    : never
