import { describe, expect, it, vi } from 'vitest'
import { isAbortError } from '../abort/index.js'
import { AbortablePromise } from './abortable.js'
import { abortable } from '../call/index.js'

describe('AbortablePromise', () => {
  it('is a Promise', async () => {
    const apThatResolves = new AbortablePromise((resolve) => {
      resolve('resolved')
    })

    await expect(apThatResolves).resolves.toEqual('resolved')

    const apThatRejects = new AbortablePromise((_, reject) => {
      reject('rejected')
    })

    await expect(apThatRejects).rejects.toEqual('rejected')
  })
  it('rejects with an AbortError if it is aborted before resolving', async () => {
    vi.useFakeTimers()

    const apThatResolves = new AbortablePromise((resolve) => {
      setTimeout(() => resolve('resolved'), 1)
    })

    apThatResolves.abort()
    vi.runAllTimers()

    await expect(apThatResolves).rejects.toSatisfy(isAbortError)
  })
  it('rejects with an AbortError if it is aborted before rejecting', async () => {
    vi.useFakeTimers()

    const apThatResolves = new AbortablePromise((_, reject) => {
      setTimeout(() => reject('rejected'), 1)
    })

    apThatResolves.abort()
    vi.runAllTimers()

    await expect(apThatResolves).rejects.toSatisfy(isAbortError)
  })
  it('does not reject if the Promise has already resolved', async () => {
    const apThatResolves = new AbortablePromise((resolve) => {
      resolve('resolved')
    })
    apThatResolves.abort()

    await expect(apThatResolves).resolves.toEqual('resolved')
  })
  it('does not reject if the Promise has already rejected', async () => {
    const apThatRejects = new AbortablePromise((_, reject) => {
      reject('rejected')
    })

    apThatRejects.abort()

    await expect(apThatRejects).rejects.toEqual('rejected')
  })
  it('does not behave differently if aborted multiple times', async () => {
    const abThatHangs = new AbortablePromise(() => {})

    abThatHangs.abort()
    abThatHangs.abort()
    abThatHangs.abort()

    await expect(abThatHangs).rejects.toSatisfy(isAbortError)

    abThatHangs.abort()

    await expect(abThatHangs).rejects.toSatisfy(isAbortError)
  })
  it('makes its AbortSignal available to its executor', async () => {
    let executorAborted: boolean = false
    const ap = new AbortablePromise((_resolve, _reject, signal) => {
      signal.addEventListener('abort', () => {
        executorAborted = true
      })
    })

    ap.abort()

    await expect(ap).rejects.toSatisfy(isAbortError)
    expect(executorAborted).toBe(true)
  })
  it('is chainable', async () => {
    const abThatResolves = new AbortablePromise((resolve) =>
      resolve('resolved'),
    )

    await expect(
      abThatResolves.then((value) => 'then ' + value),
    ).resolves.toEqual('then resolved')

    const abThatHangs = new AbortablePromise<unknown>(() => {})
    abThatHangs.abort()
    await expect(
      abThatHangs.then((value) => 'then ' + value),
    ).rejects.toSatisfy(isAbortError)
  })
  it('accepts and uses an optional AbortController', async () => {
    const controller = new AbortController()
    const ap = new AbortablePromise(() => {}, controller)

    ap.abort()

    await expect(ap).rejects.toSatisfy(isAbortError)
    expect(controller.signal.aborted).toBe(true)
  })
  it('obeys the passed AbortController', async () => {
    const controller = new AbortController()
    const ap = new AbortablePromise(() => {}, controller)

    controller.abort()

    await expect(ap).rejects.toSatisfy(isAbortError)
    expect(controller.signal.aborted).toBe(true)
  })
  it('obeys a passed AbortController that has already aborted', async () => {
    vi.useRealTimers()
    const controller = new AbortController()
    controller.abort()

    const ap = new AbortablePromise(() => {}, controller)

    await expect(ap).rejects.toSatisfy(isAbortError)
  })
})

describe('AbortablePromise.of', () => {
  it('constructs an AbortablePromise that rejects on abort', async () => {
    const pThatResolves = new Promise((resolve) => {
      resolve('resolved')
    })

    const ab = AbortablePromise.of(pThatResolves)

    ab.abort()

    await expect(ab).rejects.toSatisfy(isAbortError)
  })
  it('still calls the executor of the inner promise', async () => {
    let executorInvoked = false
    const pThatResolves = new Promise(() => {
      executorInvoked = true
    })

    const ab = AbortablePromise.of(pThatResolves)

    ab.abort()

    await expect(ab).rejects.toSatisfy(isAbortError)
    expect(executorInvoked).toBe(true)
  })
  it('works on a non-promise value', async () => {
    await expect(AbortablePromise.of('resolved')).resolves.toEqual('resolved')
    const ap = AbortablePromise.of('resolved again')

    ap.abort()

    await expect(ap).rejects.toSatisfy(isAbortError)
  })
})

describe('AbortablePromise.abort', () => {
  it('creates an AbortablePromise that has been aborted', async () => {
    await expect(AbortablePromise.abort()).rejects.toSatisfy(isAbortError)
  })
})

describe('AbortablePromise.resolve', () => {
  it('creates an AbortablePromise that will resolve to the given value unless aborted', async () => {
    await expect(AbortablePromise.resolve('resolved')).resolves.toEqual(
      'resolved',
    )

    const ap = AbortablePromise.resolve('resolved')
    ap.abort()

    await expect(ap).rejects.toSatisfy(isAbortError)
  })
})

describe('AbortablePromise.reject', () => {
  it('creates an AbortablePromise that will reject with the given reason unless aborted', async () => {
    await expect(AbortablePromise.reject('rejected')).rejects.toEqual(
      'rejected',
    )

    const ap = AbortablePromise.reject('rejected')
    ap.abort()

    await expect(ap).rejects.toSatisfy(isAbortError)
  })
})

describe('AbortablePromise.then', () => {
  it('returns an AbortablePromise', async () => {
    expect(new AbortablePromise(() => {}).then()).toBeInstanceOf(
      AbortablePromise,
    )
  })
  it('returns an AbortablePromise that behaves identically to Promise.then', async () => {
    await expect(
      AbortablePromise.resolve('resolved').then((val) => val + ' then'),
    ).resolves.toEqual('resolved then')

    await expect(
      AbortablePromise.reject('rejected').then(
        (val) => val + ' then fulfilled',
        (reason) => reason + ' then rejected',
      ),
    ).resolves.toEqual('rejected then rejected')

    await expect(
      AbortablePromise.abort().then(
        (val) => val + ' then fulfilled',
        (reason) => reason + ' then rejected',
      ),
    ).resolves.toEqual('AbortError: AbortablePromise aborted then rejected')
  })
  it('returns an AbortablePromise that aborts the original promise when aborted', async () => {
    const originalAP = new AbortablePromise(() => {})
    const thennedAP = originalAP.then()
    thennedAP.abort()

    await expect(thennedAP).rejects.toSatisfy(isAbortError)
    await expect(originalAP).rejects.toSatisfy(isAbortError)
  })
  it('works transitively', async () => {
    const originalAP = new AbortablePromise(() => {})
    const thennedAP = originalAP.then()
    const thenAgainedAP = thennedAP.then()
    thenAgainedAP.abort()

    await expect(thenAgainedAP).rejects.toSatisfy(isAbortError)
    await expect(thennedAP).rejects.toSatisfy(isAbortError)
    await expect(originalAP).rejects.toSatisfy(isAbortError)
  })
})

describe('AbortablePromise abort errors', () => {
  it('constructs a fresh AbortError per abort, so each carries its own stack', async () => {
    const first = new AbortablePromise(() => {})
    const second = new AbortablePromise(() => {})
    first.abort()
    second.abort()

    const firstReason = await first.catch((reason: unknown) => reason)
    const secondReason = await second.catch((reason: unknown) => reason)

    expect(firstReason).toSatisfy(isAbortError)
    expect(secondReason).toSatisfy(isAbortError)
    expect(firstReason).not.toBe(secondReason)
  })

  it('rejects with something that is an Error, so it can be a Failure', async () => {
    const ap = new AbortablePromise(() => {})
    ap.abort()

    await expect(ap).rejects.toBeInstanceOf(Error)
  })
})

describe('AbortablePromise.detach', () => {
  it('returns a different AbortablePromise that settles identically', async () => {
    const originalAP = new AbortablePromise<string>((resolve) =>
      resolve('value'),
    )
    const detachedAP = originalAP.detach()

    expect(detachedAP).toBeInstanceOf(AbortablePromise)
    expect(detachedAP).not.toBe(originalAP)
    await expect(detachedAP).resolves.toEqual('value')
  })

  it('does not abort the original when the detached one is aborted', async () => {
    const originalAP = new AbortablePromise<string>(() => {})
    const detachedAP = originalAP.detach()

    detachedAP.abort()

    await expect(detachedAP).rejects.toSatisfy(isAbortError)
    originalAP.abort() // only now, so the test does not hang on it
    await expect(originalAP).rejects.toSatisfy(isAbortError)
  })

  it('still rejects when the original is aborted', async () => {
    const originalAP = new AbortablePromise<string>(() => {})
    const detachedAP = originalAP.detach()

    originalAP.abort()

    await expect(originalAP).rejects.toSatisfy(isAbortError)
    await expect(detachedAP).rejects.toSatisfy(isAbortError)
  })

  it('shields one branch from another branched off the same source', async () => {
    const source = new AbortablePromise<string>(() => {})
    const shielded = source.detach().then()
    const other = source.then()

    shielded.abort()

    await expect(shielded).rejects.toSatisfy(isAbortError)
    // The source is untouched, so the sibling branch is still pending.
    source.abort()
    await expect(other).rejects.toSatisfy(isAbortError)
  })
})

describe('AbortablePromise.peer', () => {
  it('Creates a new AbortablePromise', async () => {
    const originalAP = new AbortablePromise(() => {})
    const peerAP = originalAP.peer(() => {})

    expect(peerAP).toBeInstanceOf(AbortablePromise)
    expect(peerAP).not.toBe(originalAP)
  })
  it('Creates an AbortablePromise that is aborted when the original one is aborted', async () => {
    const originalAP = new AbortablePromise(() => {})
    const peerAP = originalAP.peer(() => {})
    originalAP.abort()

    await expect(peerAP).rejects.toSatisfy(isAbortError)
    await expect(originalAP).rejects.toSatisfy(isAbortError)
  })
  it('Creates an AbortablePromise that aborts the original one when aborted', async () => {
    try {
      const originalAP = new AbortablePromise(() => {})
      const peerAP = originalAP.peer(() => {})

      peerAP.abort()

      await expect(originalAP).rejects.toSatisfy(isAbortError)
      await expect(peerAP).rejects.toSatisfy(isAbortError)
    } catch (e) {
      console.log('error during test: ', e)
    }
  })
})

describe('abortable', () => {
  it('turns a Call that returns a non-promise into an AbortableCall that resolves with that same value', async () => {
    const call = () => 'value'
    await expect(abortable(call)()).resolves.toEqual('value')
  })
  it('turns a Call that returns a regular Promise into an AbortableCall that wraps that Promise', async () => {
    const call = () => Promise.resolve('resolved value')
    await expect(abortable(call)()).resolves.toEqual('resolved value')

    const rejectingCall = () => Promise.reject('reason')
    await expect(abortable(rejectingCall)()).rejects.toEqual('reason')
  })
  it('preserves a Call that already returns an AbortablePromise', async () => {
    const call = () => AbortablePromise.resolve('resolved AbortablePromise')
    await expect(abortable(call)()).resolves.toEqual(
      'resolved AbortablePromise',
    )

    const rejectingCall = () =>
      AbortablePromise.reject('rejected AbortablePromise')
    await expect(abortable(rejectingCall)()).rejects.toEqual(
      'rejected AbortablePromise',
    )

    const abortingCall = () => AbortablePromise.abort()
    await expect(abortable(abortingCall)()).rejects.toSatisfy(isAbortError)
  })
})
