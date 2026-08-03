import { AbortablePromise } from './abortable.js'
import { abortable } from '../call/index.js'

describe(AbortablePromise, () => {
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
    jest.useFakeTimers()

    const apThatResolves = new AbortablePromise((resolve) => {
      setTimeout(() => resolve('resolved'), 1)
    })

    apThatResolves.abort()
    jest.runAllTimers()

    await expect(apThatResolves).rejects.toEqual(AbortablePromise.AbortError)
  })
  it('rejects with an AbortError if it is aborted before rejecting', async () => {
    jest.useFakeTimers()

    const apThatResolves = new AbortablePromise((_, reject) => {
      setTimeout(() => reject('rejected'), 1)
    })

    apThatResolves.abort()
    jest.runAllTimers()

    await expect(apThatResolves).rejects.toEqual(AbortablePromise.AbortError)
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

    await expect(abThatHangs).rejects.toEqual(AbortablePromise.AbortError)

    abThatHangs.abort()

    await expect(abThatHangs).rejects.toEqual(AbortablePromise.AbortError)
  })
  it('makes its AbortSignal available to its executor', async () => {
    let executorAborted: boolean = false
    const ap = new AbortablePromise((resolve, reject, signal) => {
      signal.addEventListener('abort', () => {
        executorAborted = true
      })
    })

    ap.abort()

    await expect(ap).rejects.toEqual(AbortablePromise.AbortError)
    expect(executorAborted).toBeTrue()
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
    await expect(abThatHangs.then((value) => 'then ' + value)).rejects.toEqual(
      AbortablePromise.AbortError,
    )
  })
  it('accepts and uses an optional AbortController', async () => {
    const controller = new AbortController()
    const ap = new AbortablePromise(() => {}, controller)

    ap.abort()

    await expect(ap).rejects.toEqual(AbortablePromise.AbortError)
    expect(controller.signal.aborted).toBeTrue()
  })
  it('obeys the passed AbortController', async () => {
    const controller = new AbortController()
    const ap = new AbortablePromise(() => {}, controller)

    controller.abort()

    await expect(ap).rejects.toEqual(AbortablePromise.AbortError)
    expect(controller.signal.aborted).toBeTrue()
  })
  it('obeys a passed AbortController that has already aborted', async () => {
    jest.useRealTimers()
    const controller = new AbortController()
    controller.abort()

    const ap = new AbortablePromise(() => {}, controller)

    await expect(ap).rejects.toEqual(AbortablePromise.AbortError)
  })
})

describe(AbortablePromise.of, () => {
  it('constructs an AbortablePromise that rejects on abort', async () => {
    const pThatResolves = new Promise((resolve) => {
      resolve('resolved')
    })

    const ab = AbortablePromise.of(pThatResolves)

    ab.abort()

    await expect(ab).rejects.toEqual(AbortablePromise.AbortError)
  })
  it('still calls the executor of the inner promise', async () => {
    let executorInvoked = false
    const pThatResolves = new Promise(() => {
      executorInvoked = true
    })

    const ab = AbortablePromise.of(pThatResolves)

    ab.abort()

    await expect(ab).rejects.toEqual(AbortablePromise.AbortError)
    expect(executorInvoked).toBeTrue()
  })
  it('works on a non-promise value', async () => {
    await expect(AbortablePromise.of('resolved')).resolves.toEqual('resolved')
    const ap = AbortablePromise.of('resolved again')

    ap.abort()

    await expect(ap).rejects.toEqual(AbortablePromise.AbortError)
  })
})

describe(AbortablePromise.abort, () => {
  it('creates an AbortablePromise that has been aborted', async () => {
    await expect(AbortablePromise.abort()).rejects.toEqual(
      AbortablePromise.AbortError,
    )
  })
})

describe(AbortablePromise.resolve, () => {
  it('creates an AbortablePromise that will resolve to the given value unless aborted', async () => {
    await expect(AbortablePromise.resolve('resolved')).resolves.toEqual(
      'resolved',
    )

    const ap = AbortablePromise.resolve('resolved')
    ap.abort()

    await expect(ap).rejects.toEqual(AbortablePromise.AbortError)
  })
})

describe(AbortablePromise.reject, () => {
  it('creates an AbortablePromise that will reject with the given reason unless aborted', async () => {
    await expect(AbortablePromise.reject('rejected')).rejects.toEqual(
      'rejected',
    )

    const ap = AbortablePromise.reject('rejected')
    ap.abort()

    await expect(ap).rejects.toBe(AbortablePromise.AbortError)
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

    await expect(thennedAP).rejects.toEqual(AbortablePromise.AbortError)
    await expect(originalAP).rejects.toEqual(AbortablePromise.AbortError)
  })
  it('works transitively', async () => {
    const originalAP = new AbortablePromise(() => {})
    const thennedAP = originalAP.then()
    const thenAgainedAP = thennedAP.then()
    thenAgainedAP.abort()

    await expect(thenAgainedAP).rejects.toEqual(AbortablePromise.AbortError)
    await expect(thennedAP).rejects.toEqual(AbortablePromise.AbortError)
    await expect(originalAP).rejects.toEqual(AbortablePromise.AbortError)
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

    await expect(peerAP).rejects.toBe(AbortablePromise.AbortError)
    await expect(originalAP).rejects.toBe(AbortablePromise.AbortError)
  })
  it('Creates an AbortablePromise that aborts the original one when aborted', async () => {
    try {
      const originalAP = new AbortablePromise(() => {})
      const peerAP = originalAP.peer(() => {})

      peerAP.abort()

      await expect(originalAP).rejects.toBe(AbortablePromise.AbortError)
      await expect(peerAP).rejects.toBe(AbortablePromise.AbortError)
    } catch (e) {
      console.log('error during test: ', e)
    }
  })
})

describe(`${abortable.name}`, () => {
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
    await expect(abortable(abortingCall)()).rejects.toEqual(
      AbortablePromise.AbortError,
    )
  })
})
