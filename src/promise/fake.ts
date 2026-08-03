import { AbortablePromise } from './abortable.js'

/**
 * Creates a Promise that can be resolved or rejected manually
 * via the resolve/reject methods on the Promise object.
 */
export function fakePromise<T>(): Promise<T> & {
  resolve(v: T): void
  reject(r: unknown): void
} {
  let manualResolve: (value: T) => void
  let manualReject: (reason: unknown) => void
  const promise = new Promise<T>((resolve, reject) => {
    manualResolve = resolve
    manualReject = reject
  })

  return Object.assign(promise, {
    resolve: manualResolve!,
    reject: manualReject!,
  })
}

/**
 * Creates an AbortablePromise that can be resolved or rejected manually
 * via the resolve/reject methods on the AbortablePromise object.
 * Like all AbortablePromises, it can also be aborted with the abort method.
 */
export function fakeAbortablePromise<T>(): AbortablePromise<T> & {
  resolve(v: T): void
  reject(r: unknown): void
} {
  let manualResolve: (value: T) => void
  let manualReject: (reason: unknown) => void
  const promise = new AbortablePromise<T>((resolve, reject) => {
    manualResolve = resolve
    manualReject = reject
  })

  return Object.assign(promise, {
    resolve: manualResolve!,
    reject: manualReject!,
  })
}
