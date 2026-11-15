/* Module-private, shared by `/result`, `/maybe` and `/promise`. Absent from
   the package's exports map: it ships in `dist` but a consumer cannot import
   it. It is a module of its own so that `/maybe` can use it without importing
   `/result` at runtime (see docs/adr/0001-unboxed-maybe-and-result.md). */

/* `value instanceof Error`, except that a guard which throws (a Proxy whose
   `getPrototypeOf` trap throws) answers false instead, so the guard's own
   error never replaces the value being classified. */
export function isError(value: unknown): value is Error {
  try {
    return value instanceof Error
  } catch {
    return false
  }
}
