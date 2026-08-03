/**
 * The Error a rejection is wrapped in when the rejection reason was not
 * already an `Error`. A `Failure` must carry an `Error`, and a promise may
 * reject with anything at all; this preserves whatever it was on `reason`.
 */
export class RejectionError<T> extends Error {
  readonly reason: T

  constructor(reason: T) {
    super(`promise rejected with ${reason}`)
    this.reason = reason
  }
}
