/**
 * Where an asynchronous operation currently is: not yet started, running, or
 * settled one way or the other. A state machine over time, which is a
 * different question from the one `Result` answers — `Result` says how an
 * operation *ended*, and has no case for "hasn't ended yet".
 *
 * `rejected` carries an unbounded `reason` rather than an `Error`, because
 * that is what a promise rejection actually gives you. Narrowing it to an
 * `Error`, so that a settled State can become a `Result`, is what
 * {@link fail} in `promise/resultify` is for.
 */
export type State<O> =
  | { status: 'initial' }
  | { status: 'pending' }
  | { status: 'fulfilled'; value: O }
  | { status: 'rejected'; reason: unknown }

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
