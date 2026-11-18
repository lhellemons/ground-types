/* Module-private, shared by `/result` and `/promise`. Absent from the
   package's exports map: it ships in `dist` but a consumer cannot import it. */

/* The renderer behind `ThrownError.describe` and the default messages of
   `ThrownError` and `RejectionError`. */
export function describeThrown(value: unknown): string {
  // `String` first: it is special-cased for symbols, where template
  // interpolation throws. `Object.prototype.toString` is the fallback; it
  // still reads `Symbol.toStringTag`, so a hostile Proxy can throw there
  // too, and the constant is the last resort.
  try {
    return String(value)
  } catch {
    try {
      return Object.prototype.toString.call(value)
    } catch {
      return '[object Unknown]'
    }
  }
}
