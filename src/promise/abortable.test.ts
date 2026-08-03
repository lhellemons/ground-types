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

describe('AbortablePromise delegated resolution', () => {
  it('stays abortable while the promise it resolved with is pending', async () => {
    // Resolving with a promise is not settling — the outcome has been handed
    // to that promise, which may take a long time or never arrive. This is the
    // shape the class exists for, and abort silently did nothing for it while
    // resolution alone counted as settlement. Contrast the plain-value case
    // above, where resolving really does settle and abort is a no-op.
    let finishWork!: (value: string) => void
    const work = new Promise<string>((resolve) => {
      finishWork = resolve
    })
    const ap = new AbortablePromise<string>((resolve) => resolve(work))

    ap.abort()
    finishWork('work finished anyway')

    await expect(ap).rejects.toSatisfy(isAbortError)
  })

  it('settles from the promise it resolved with when it is not aborted', async () => {
    let finishWork!: (value: string) => void
    const work = new Promise<string>((resolve) => {
      finishWork = resolve
    })
    const ap = new AbortablePromise<string>((resolve) => resolve(work))

    finishWork('work finished')

    await expect(ap).resolves.toEqual('work finished')
  })

  it('takes the rejection of the promise it resolved with', async () => {
    const ap = new AbortablePromise<string>((resolve) =>
      resolve(Promise.reject('work failed')),
    )

    await expect(ap).rejects.toEqual('work failed')
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

  // Called through wrappers rather than indexed off the class: each is
  // overloaded, and indexed access gives a union of overload sets TypeScript
  // will not call — while extracting one loses the receiver `Promise.all` and
  // friends need.
  const combinators = {
    all: (values: AbortablePromise<string>[]) => AbortablePromise.all(values),
    race: (values: AbortablePromise<string>[]) => AbortablePromise.race(values),
    any: (values: AbortablePromise<string>[]) => AbortablePromise.any(values),
    allSettled: (values: AbortablePromise<string>[]) =>
      AbortablePromise.allSettled(values),
  }

  it.each(Object.keys(combinators) as (keyof typeof combinators)[])(
    'aborting the promise returned by %s aborts its members',
    async (combinator) => {
      const a = new AbortablePromise<string>(() => {})
      const b = new AbortablePromise<string>(() => {})

      const combined = combinators[combinator]([a, b])
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

describe('AbortablePromise fan-in typing', () => {
  it('keeps each member’s type in position, as Promise does', async () => {
    // The regression these annotations guard: with only the iterable overload
    // declared, a mixed-type call was a type error rather than a tuple, and a
    // same-type call degraded from [number, number] to number[].
    const all: AbortablePromise<[number, string]> = AbortablePromise.all([
      Promise.resolve(1),
      Promise.resolve('a'),
    ])
    await expect(all).resolves.toEqual([1, 'a'])

    const allSettled: AbortablePromise<
      [PromiseSettledResult<number>, PromiseSettledResult<string>]
    > = AbortablePromise.allSettled([Promise.resolve(1), Promise.resolve('a')])
    await expect(allSettled).resolves.toEqual([
      { status: 'fulfilled', value: 1 },
      { status: 'fulfilled', value: 'a' },
    ])

    const race: AbortablePromise<number | string> = AbortablePromise.race([
      Promise.resolve(1),
      Promise.resolve('a'),
    ])
    await expect(race).resolves.toEqual(1)

    const any: AbortablePromise<number | string> = AbortablePromise.any([
      Promise.resolve(1),
      Promise.resolve('a'),
    ])
    await expect(any).resolves.toEqual(1)
  })

  it('still accepts a homogeneous iterable that is not an array', async () => {
    const members = new Set([Promise.resolve(1), Promise.resolve(2)])
    const combined: AbortablePromise<number[]> = AbortablePromise.all(members)

    await expect(combined).resolves.toEqual([1, 2])
  })
})

describe('AbortablePromise.abortOn', () => {
  it('aborts when the signal it is bound to aborts', async () => {
    const controller = new AbortController()
    const ap = new AbortablePromise<string>(() => {}).abortOn(controller.signal)

    controller.abort()

    await expect(ap).rejects.toSatisfy(isAbortError)
  })

  it('aborts at once when the signal has already aborted', async () => {
    const controller = new AbortController()
    controller.abort()

    const ap = new AbortablePromise<string>(() => {}).abortOn(controller.signal)

    await expect(ap).rejects.toSatisfy(isAbortError)
  })

  it('returns the same promise, so it can be bound inline', () => {
    const controller = new AbortController()
    const ap = AbortablePromise.resolve('value')

    expect(ap.abortOn(controller.signal)).toBe(ap)
  })

  it('registers one listener, released by the signal aborting', async () => {
    const controller = new AbortController()
    const addEventListener = vi.spyOn(controller.signal, 'addEventListener')

    const ap = new AbortablePromise<string>(() => {}).abortOn(controller.signal)

    expect(addEventListener).toHaveBeenCalledTimes(1)
    expect(addEventListener).toHaveBeenCalledWith(
      'abort',
      expect.any(Function),
      { once: true },
    )

    ap.abort()
    await expect(ap).rejects.toSatisfy(isAbortError)
  })

  it('leaves a promise that settled first alone when the signal aborts', async () => {
    // The listener is deliberately not released on settlement — observing
    // settlement would mark the promise handled. See ADR-0002. What matters is
    // that a late abort cannot disturb an already-settled promise.
    const controller = new AbortController()
    const ap = AbortablePromise.resolve('value').abortOn(controller.signal)

    await expect(ap).resolves.toEqual('value')

    controller.abort()

    await expect(ap).resolves.toEqual('value')
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
    // No try/catch here. The imported version wrapped this body in one that
    // logged and swallowed, so every assertion in it threw into the catch and
    // the test passed whatever the class did.
    const originalAP = new AbortablePromise(() => {})
    const peerAP = originalAP.peer(() => {})

    peerAP.abort()

    await expect(originalAP).rejects.toSatisfy(isAbortError)
    await expect(peerAP).rejects.toSatisfy(isAbortError)
  })
})

// Whether a rejection goes unhandled is a host behaviour, so the suite below
// is the one place that reaches for Node. The library's `lib` is ES2022 + DOM
// by the choice recorded in tsconfig, which leaves `process` out of scope;
// declaring the two methods used here keeps that choice rather than adding
// @types/node for one event listener.
declare const process: {
  on(event: 'unhandledRejection', listener: (reason: unknown) => void): void
  off(event: 'unhandledRejection', listener: (reason: unknown) => void): void
}

describe('AbortablePromise unhandled rejections', () => {
  /**
   * Reports the rejections Node found nobody handling while `body` ran. An
   * abort *is* a rejection, and an unhandled rejection ends a Node process, so
   * "who attaches the handler" is a real property of each shape rather than a
   * detail — this is what the class docblock's safe/unsafe split rests on.
   */
  async function unhandledDuring(body: () => void): Promise<unknown[]> {
    vi.useRealTimers()
    const seen: unknown[] = []
    const record = (reason: unknown) => seen.push(reason)

    process.on('unhandledRejection', record)
    try {
      body()
      // Node decides a rejection is unhandled at the end of a macrotask turn.
      await new Promise((resolve) => setTimeout(resolve, 0))
    } finally {
      process.off('unhandledRejection', record)
    }

    return seen
  }

  it('leaves none behind when an aborted chain is consumed at its tail', async () => {
    // The head is rejected by the propagation, and handled by the chain that
    // rejected it. A caller holding only the tail is not leaking anything.
    const unhandled = await unhandledDuring(() => {
      const head = new AbortablePromise<string>(() => {})
      const tail = head.then((value) => value).then((value) => value)
      tail.abort()
      void tail.catch(() => {})
    })

    expect(unhandled).toEqual([])
  })

  it('leaves none behind when an aborted fan-in is consumed', async () => {
    // Every member is rejected by the abort, and every member was handled by
    // the combinator when it took them in.
    const unhandled = await unhandledDuring(() => {
      const combined = AbortablePromise.all([
        new AbortablePromise<string>(() => {}),
        new AbortablePromise<string>(() => {}),
      ])
      combined.abort()
      void combined.catch(() => {})
    })

    expect(unhandled).toEqual([])
  })

  it('leaves none behind when a detached branch is aborted', async () => {
    const unhandled = await unhandledDuring(() => {
      const source = new AbortablePromise<string>(() => {})
      const branch = source.detach()
      branch.abort()
      void branch.catch(() => {})
      void source.catch(() => {})
    })

    expect(unhandled).toEqual([])
  })
})
