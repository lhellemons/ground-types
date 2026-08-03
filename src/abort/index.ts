/**
 * The `name` the platform gives a `DOMException` raised by aborting an
 * `AbortSignal`. Matching on this rather than on a class is what lets
 * {@link isAbortError} recognise aborts raised by `fetch` and other platform
 * APIs, which never construct our {@link AbortError}.
 */
export const ABORT_ERROR_NAME = 'AbortError'

/**
 * The Error an abort rejects with. Extends `DOMException` with the platform's
 * `AbortError` name, so it is indistinguishable from an abort raised by
 * `fetch` or any other signal-aware platform API.
 *
 * `DOMException` inherits from `Error`, so an `AbortError` is a valid
 * `Failure` in this library's unboxed Result encoding: `promise/fail` passes
 * it through with its concrete class intact rather than wrapping it in a
 * `RejectionError`.
 */
export class AbortError extends DOMException {
  constructor(message?: string) {
    super(message, ABORT_ERROR_NAME)
  }
}

/**
 * Type guard: true when `error` is an abort raised by calling `abort()` on an
 * `AbortSignal` — ours or the platform's.
 *
 * Prefer this over `instanceof AbortError` or reference equality against a
 * particular instance. Each abort constructs its own Error so that it carries
 * its own stack, and platform aborts are plain `DOMException`s that were
 * never instances of our subclass at all.
 */
export function isAbortError(error: unknown): error is AbortError {
  return error instanceof DOMException && error.name === ABORT_ERROR_NAME
}
