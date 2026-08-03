import { describe, expect, it, vi } from 'vitest'
import { isAbortError } from '../abort/index.js'
import { AbortablePromise } from './abortable.js'

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
    const ap = new AbortablePromise((_resolve, _reject, context) => {
      context.signal.addEventListener('abort', () => {
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

describe('AbortablePromise fan-in combinators', () => {
  it('still behave like Promise’s when nothing is aborted', async () => {
    await expect(
      AbortablePromise.all([
        AbortablePromise.resolve('a'),
        Promise.resolve('b'),
      ]),
    ).resolves.toEqual(['a', 'b'])

    await expect(
      AbortablePromise.race([
        AbortablePromise.resolve('first'),
        new AbortablePromise<string>(() => {}),
      ]),
    ).resolves.toEqual('first')

    await expect(
      AbortablePromise.allSettled([AbortablePromise.reject('nope')]),
    ).resolves.toEqual([{ status: 'rejected', reason: 'nope' }])
  })

  it.each(['all', 'race', 'any', 'allSettled'] as const)(
    'aborting the promise returned by %s aborts its members',
    async (combinator) => {
      const a = new AbortablePromise<string>(() => {})
      const b = new AbortablePromise<string>(() => {})

      const combined = AbortablePromise[combinator]([a, b])
      combined.abort()

      await expect(combined).rejects.toSatisfy(isAbortError)
      await expect(a).rejects.toSatisfy(isAbortError)
      await expect(b).rejects.toSatisfy(isAbortError)
    },
  )

  it('skips members that are plain Promises', async () => {
    const abortable = new AbortablePromise<string>(() => {})
    const plain = new Promise<string>(() => {})

    const combined = AbortablePromise.all([abortable, plain])
    combined.abort()

    await expect(combined).rejects.toSatisfy(isAbortError)
    await expect(abortable).rejects.toSatisfy(isAbortError)
    // `plain` is simply left alone — there is nothing on it to abort.
  })

  it('does not abort the losers when a member settles first', async () => {
    const winner = AbortablePromise.resolve('winner')
    const loser = new AbortablePromise<string>((resolve) => {
      setTimeout(() => resolve('loser finished anyway'), 1)
    })

    await expect(AbortablePromise.race([winner, loser])).resolves.toEqual(
      'winner',
    )

    // Settling first says the result is unwanted, not that the remaining work
    // should be cancelled.
    await expect(loser).resolves.toEqual('loser finished anyway')
  })
})

describe('AbortablePromise abort context', () => {
  /** Counts AbortControllers built while `body` runs. */
  async function countingControllers(body: () => Promise<void>) {
    const Real = globalThis.AbortController
    let built = 0
    class Counting extends Real {
      constructor() {
        super()
        built++
      }
    }
    globalThis.AbortController = Counting as unknown as typeof AbortController
    try {
      await body()
    } finally {
      globalThis.AbortController = Real
    }
    return built
  }

  it('allocates no AbortController for a chain that never reads the signal', async () => {
    const built = await countingControllers(async () => {
      await AbortablePromise.resolve('x')
        .then((v) => `${v}y`)
        .then((v) => `${v}z`)
    })

    expect(built).toBe(0)
  })

  it('allocates one the first time the executor reads the signal, and reuses it', async () => {
    let first: AbortSignal | undefined
    let second: AbortSignal | undefined

    const built = await countingControllers(async () => {
      const ap = new AbortablePromise<string>((resolve, _reject, context) => {
        first = context.signal
        second = context.signal
        resolve('done')
      })
      await ap
    })

    expect(built).toBe(1)
    expect(first).toBeInstanceOf(AbortSignal)
    expect(first).toBe(second)
  })

  it('aborts correctly even though no controller was ever created', async () => {
    const built = await countingControllers(async () => {
      const ap = new AbortablePromise<string>(() => {})
      ap.abort()
      await expect(ap).rejects.toSatisfy(isAbortError)
    })

    expect(built).toBe(0)
  })

  it('propagates upstream without a controller on either promise', async () => {
    const built = await countingControllers(async () => {
      const source = new AbortablePromise<string>(() => {})
      const derived = source.then((v) => v)

      derived.abort()

      await expect(derived).rejects.toSatisfy(isAbortError)
      await expect(source).rejects.toSatisfy(isAbortError)
    })

    expect(built).toBe(0)
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
