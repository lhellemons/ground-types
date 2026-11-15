import { hasPrototype } from '../internal/is-error.js'

/* Captured when the module loads. */
const domExceptionPrototype = DOMException.prototype

/**
 * The `name` the platform gives a `DOMException` raised by aborting an
 * `AbortSignal` — what {@link isAbortError} matches on.
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
 * Recognise aborts with this, never with `instanceof AbortError` or
 * reference equality: each abort constructs its own Error, and platform
 * aborts are plain `DOMException`s that were never instances of our
 * subclass at all.
 *
 * The check asks whether `DOMException.prototype` is on the prototype chain
 * (`isPrototypeOf`) and never uses `instanceof`, so a defined
 * `DOMException[Symbol.hasInstance]` is not consulted.
 *
 * Never throws: a value on which the check itself throws (a Proxy whose
 * `getPrototypeOf` or `get` trap throws, a revoked Proxy) is not an abort,
 * so the answer is `false`. So is a Proxy over a real abort whose `name` is
 * read through the proxy (no traps, or a `Reflect.get` forwarder that passes
 * the receiver on): the platform's `name` getter rejects the proxy.
 */
export function isAbortError(error: unknown): error is AbortError {
  // Wider than the class it narrows to, soundly: a platform abort is a plain
  // DOMException, and AbortError adds nothing beyond the fixed name, so the
  // narrowing promises no member it cannot deliver.
  try {
    return (
      hasPrototype(domExceptionPrototype, error) &&
      (error as DOMException).name === ABORT_ERROR_NAME
    )
  } catch {
    return false
  }
}
