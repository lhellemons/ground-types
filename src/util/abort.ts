export const ABORT_ERROR_NAME = 'AbortError'

export class AbortError extends DOMException {
  constructor(message?: string) {
    super(message, ABORT_ERROR_NAME)
  }
}

/**
 * Check if the given error is an abort error caused by calling abort() on an AbortSignal
 */
export function isAbortError(error: any): error is AbortError {
  return error instanceof DOMException && error.name === ABORT_ERROR_NAME
}
