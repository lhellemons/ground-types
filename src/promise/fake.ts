import { AbortablePromise } from './abortable.js'

/**
 * A Promise whose settlement a test drives, rather than the work it stands
 * for. Reach for this to hold an operation open across an assertion — that a
 * spinner shows while a request is in flight, that a second call is not made
 * before the first returns — and settle it when the test is ready.
 *
 * The handles are attached to the promise itself rather than handed back
 * alongside it, so a fake substitutes for the real promise everywhere without
 * a wrapper object to unpack.
 *
 * Nothing settles a fake for you. A fake that is rejected and never awaited is
 * an unhandled rejection like any other, and one that is never settled at all
 * keeps whatever awaits it pending for the rest of the test.
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
 * The {@link fakePromise} of {@link AbortablePromise}s: settlement is driven
 * by the test, and everything said there applies here too.
 *
 * The reason to reach for this one is `abort()`, which is a real abort rather
 * than a third manual handle — so a test can assert what its subject does when
 * the work it started is cancelled, including that the fake rejects with an
 * `AbortError` and that anything derived from it aborts as well.
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
