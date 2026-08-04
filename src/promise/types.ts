import { ThrownError } from '../result/index.js'

/**
 * The Error a rejection is wrapped in when the rejection reason was not
 * already an `Error`. A `Failure` must carry an `Error`, and a promise may
 * reject with anything at all; this preserves whatever it was on `reason`.
 * Constructed by `promise/fail`.
 *
 * The asynchronous case of {@link ThrownError}, which `result/tryCatch` uses
 * for the same purpose on a synchronous throw.
 */
export class RejectionError<T = unknown> extends ThrownError<T> {
  constructor(reason: T) {
    // The renderer is ThrownError's because interpolating an untrusted value
    // is what both classes must survive: a reason may be a symbol, an object
    // with a null prototype, or one whose `toString` throws, and a throw here
    // escapes `promise/resultify` as a rejection — breaking the one promise it
    // makes.
    super(reason, `promise rejected with ${ThrownError.describe(reason)}`)
  }

  /** The rejection reason, named for the channel it arrived on. */
  get reason(): T {
    return this.thrown
  }
}
