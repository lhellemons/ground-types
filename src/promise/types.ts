import { describeThrown } from '../internal/describe-thrown.js'
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
    super(reason, `promise rejected with ${describeThrown(reason)}`)
  }

  /** The rejection reason, named for the channel it arrived on. */
  get reason(): T {
    return this.thrown
  }
}
