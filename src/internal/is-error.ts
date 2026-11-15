/* Module-private, shared by `/result`, `/maybe` and `/promise`. Absent from
   the package's exports map: it ships in `dist` but a consumer cannot import
   it. It is a module of its own so that `/maybe` can use it without importing
   `/result` at runtime (see docs/adr/0001-unboxed-maybe-and-result.md). */

/* Whether `Error.prototype` is on `value`'s prototype chain: the answer of
   `value instanceof Error`, but by `isPrototypeOf` and never `instanceof`, so
   `Error[Symbol.hasInstance]` is not consulted (a hook that throws would
   otherwise turn every real `Error` into a non-Error). A value on which the
   chain walk throws (a Proxy whose `getPrototypeOf` trap throws, a revoked
   Proxy) answers false instead, so the guard's own error never replaces the
   value being classified. */
export function isError(value: unknown): value is Error {
  try {
    return Object.prototype.isPrototypeOf.call(Error.prototype, value as object)
  } catch {
    return false
  }
}
