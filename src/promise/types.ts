/**
 * The Error a rejection is wrapped in when the rejection reason was not
 * already an `Error`. A `Failure` must carry an `Error`, and a promise may
 * reject with anything at all; this preserves whatever it was on `reason`.
 *
 * `T` defaults to `unknown` because that is what a rejection reason is where
 * `promise/fail` constructs one: a caller naming this type in an annotation
 * should not have to supply an argument the encoding never knows.
 */
export class RejectionError<T = unknown> extends Error {
  readonly reason: T

  constructor(reason: T) {
    super(`promise rejected with ${describeReason(reason)}`)
    this.reason = reason
  }
}

/**
 * Renders a rejection reason for the message without trusting it to be
 * renderable. This Error exists precisely for reasons that are *not*
 * well-behaved Errors, and a reason may be a symbol, an object with a null
 * prototype, or one whose `toString` throws. Interpolating such a reason
 * directly throws from the constructor, and that throw escapes
 * `promise/resultify` as a rejection — breaking the one promise it makes.
 *
 * `String` is tried first because it is special-cased for symbols, where
 * template interpolation is not; `Object.prototype.toString` is the fallback
 * because it reads no property of the reason at all.
 */
function describeReason(reason: unknown): string {
  try {
    return String(reason)
  } catch {
    return Object.prototype.toString.call(reason)
  }
}
