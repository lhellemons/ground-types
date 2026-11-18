/* Module-private, shared by `/result` and `/promise`. Absent from the
   package's exports map: it ships in `dist` but a consumer cannot import it. */

/* `String`, and `Object.prototype.toString` bound to
   `Function.prototype.call`, both captured when the module loads, as
   `regExpExec` is in `/result`. */
const toText: (value: unknown) => string = String
const objectToString: (value: unknown) => string =
  // eslint-disable-next-line @typescript-eslint/unbound-method -- bound at once
  Function.prototype.call.bind(Object.prototype.toString)

/* The renderer behind `ThrownError.describe` and the default messages of
   `ThrownError` and `RejectionError`. */
export function describeThrown(value: unknown): string {
  // `String` first: it is special-cased for symbols, where template
  // interpolation throws. `Object.prototype.toString` is the fallback; it
  // still reads `Symbol.toStringTag`, so a hostile Proxy can throw there
  // too, and the constant is the last resort.
  try {
    return toText(value)
  } catch {
    try {
      return objectToString(value)
    } catch {
      return '[object Unknown]'
    }
  }
}
