import { getEventListeners } from 'node:events'
import vm from 'node:vm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isAbortError } from '../abort/index.js'
import { AbortablePromise, type AbortContext } from './abortable.js'

// Whether a rejection goes unhandled is a host behaviour, so the suite below
// is the one place that reaches for Node. The library's `lib` is ES2022 + DOM
// by the choice recorded in tsconfig, which leaves `process` out of scope;
// declaring the two methods used here keeps that choice rather than adding
// @types/node for one event listener.
declare const process: {
  on(event: 'unhandledRejection', listener: (reason: unknown) => void): void
  off(event: 'unhandledRejection', listener: (reason: unknown) => void): void
}

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
    // A rejection an earlier test left unhandled is reported at the end of a
    // macrotask: let one pass, and forget what it reported, so that what is
    // recorded below is the body's.
    await new Promise((resolve) => setTimeout(resolve, 0))
    seen.length = 0
    body()
    // Node decides a rejection is unhandled at the end of a macrotask turn.
    await new Promise((resolve) => setTimeout(resolve, 0))
  } finally {
    process.off('unhandledRejection', record)
  }

  return seen
}

/** The abort listeners on `signal`. */
const listeners = (signal: AbortSignal) => getEventListeners(signal, 'abort')

// A test that fakes the timers must not leave them faked: in a shuffled run,
// a later test that waits on a real `setTimeout` would hang.
afterEach(() => {
  vi.useRealTimers()
})

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
      abThatResolves.then((value) => 'then ' + String(value)),
    ).resolves.toEqual('then resolved')

    const abThatHangs = new AbortablePromise<unknown>(() => {})
    abThatHangs.abort()
    await expect(
      abThatHangs.then((value) => 'then ' + String(value)),
    ).rejects.toSatisfy(isAbortError)
  })
  it('accepts and uses an optional AbortController', async () => {
    const controller = new AbortController()
    const ap = new AbortablePromise(() => {}, controller)

    ap.abort()

    await expect(ap).rejects.toSatisfy(isAbortError)
    expect(controller.signal.aborted).toBe(true)
  })
  it('releases its listener on a passed AbortController when it settles', async () => {
    // Same retention as abortOn's, and it was undocumented here: a controller
    // handed in may govern many promises over its lifetime.
    const controller = new AbortController()

    const ap = new AbortablePromise<string>(
      (resolve) => resolve('value'),
      controller,
    )
    await ap

    expect(listeners(controller.signal)).toHaveLength(0)
    // Releasing does not disarm the controller for anything else it governs.
    controller.abort()
    await expect(ap).resolves.toEqual('value')
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

  it('aborts an AbortablePromise it delegated to', async () => {
    // Delegation is upstream, so it propagates like `then` does. The gap this
    // closes: the outer promise rejected while the work it delegated to — the
    // whole reason for wrapping it — ran on, uncancelled and unobserved.
    const work = new AbortablePromise<string>(() => {})
    const ap = new AbortablePromise<string>((resolve) => resolve(work))

    ap.abort()

    await expect(ap).rejects.toSatisfy(isAbortError)
    await expect(work).rejects.toSatisfy(isAbortError)
  })

  it('aborts a delegate handed over after the abort has already happened', async () => {
    // An executor may resolve long after its promise was aborted. The link is
    // registered at that point, so it has to fire at once rather than wait for
    // an abort that is already in the past.
    let delegate!: (value: Promise<string>) => void
    const ap = new AbortablePromise<string>((resolve) => {
      delegate = resolve
    })

    ap.abort()
    const work = new AbortablePromise<string>(() => {})
    delegate(work)

    await expect(ap).rejects.toSatisfy(isAbortError)
    await expect(work).rejects.toSatisfy(isAbortError)
  })

  it('leaves a plain Promise it delegated to alone', async () => {
    let finishWork!: (value: string) => void
    const work = new Promise<string>((resolve) => {
      finishWork = resolve
    })
    const ap = new AbortablePromise<string>((resolve) => resolve(work))

    ap.abort()
    finishWork('work finished anyway')

    await expect(ap).rejects.toSatisfy(isAbortError)
    // There is nothing on a plain Promise to abort, so it runs to completion.
    await expect(work).resolves.toEqual('work finished anyway')
  })

  it('hands over the outcome without the right to cancel, given a detached delegate', async () => {
    // `detach()` is the escape hatch at a delegation just as it is at a branch.
    const work = new AbortablePromise<string>((resolve) =>
      setTimeout(() => resolve('work finished anyway'), 1),
    )
    const ap = new AbortablePromise<string>((resolve) => resolve(work.detach()))

    ap.abort()

    await expect(ap).rejects.toSatisfy(isAbortError)
    await expect(work).resolves.toEqual('work finished anyway')
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

/* A value whose `instanceof` throws: a Proxy whose `getPrototypeOf` trap throws,
   and a revoked Proxy. Native `Promise` never asks a value for its prototype,
   so it treats the first as an ordinary value; it rejects on the second, whose
   `then` it cannot read. */
function hostileProxy<T extends object>(target: T): T {
  return new Proxy(target, {
    getPrototypeOf(): never {
      throw new RangeError('trap')
    },
  })
}

/* A Proxy whose `get` binds every method to the target, so calling a method
   through it works where it would not with no traps. */
function bindingProxy<T extends object>(target: T): T {
  return new Proxy(target, {
    get(t, key) {
      const value: unknown = Reflect.get(t, key)
      return typeof value === 'function'
        ? (value as (...args: unknown[]) => unknown).bind(t)
        : value
    },
  })
}

function revokedProxy(): object {
  const { proxy, revoke } = Proxy.revocable({}, {})
  revoke()
  return proxy
}

describe('AbortablePromise with a value whose prototype chain throws', () => {
  it('of() resolves it, as Promise.resolve does', async () => {
    const hostile = hostileProxy({})

    expect(() => AbortablePromise.of(hostile)).not.toThrow()
    await expect(AbortablePromise.of(hostile)).resolves.toBe(hostile)
    await expect(Promise.resolve(hostile)).resolves.toBe(hostile)
  })

  it('of() adopts a hostile thenable, as Promise.resolve does', async () => {
    const hostileThenable = hostileProxy({
      then(resolve: (value: string) => void) {
        resolve('adopted')
      },
    })

    await expect(AbortablePromise.of<unknown>(hostileThenable)).resolves.toBe(
      'adopted',
    )
    await expect(Promise.resolve(hostileThenable)).resolves.toBe('adopted')
  })

  it('of() rejects, rather than throws, for a revoked Proxy, as Promise.resolve does', async () => {
    const revoked = revokedProxy()

    await expect(Promise.resolve(revoked)).rejects.toBeInstanceOf(TypeError)
    let ap: AbortablePromise<unknown> | undefined
    expect(() => {
      ap = AbortablePromise.of(revoked)
    }).not.toThrow()
    await expect(ap).rejects.toBeInstanceOf(TypeError)
  })

  it('an executor resolving with a hostile thenable adopts it, as new Promise does', async () => {
    const hostileThenable = hostileProxy({
      then(resolve: (value: string) => void) {
        resolve('adopted')
      },
    })

    await expect(
      new Promise<string>((resolve) => resolve(hostileThenable as never)),
    ).resolves.toBe('adopted')
    await expect(
      new AbortablePromise<string>((resolve) =>
        resolve(hostileThenable as never),
      ),
    ).resolves.toBe('adopted')
  })

  /* Calls `resolve(value)` once the executor has returned, and reports whether
     that call threw. */
  function resolveLate(
    construct: (
      executor: (resolve: (value: unknown) => void) => void,
    ) => Promise<unknown>,
    value: unknown,
  ): { promise: Promise<unknown>; thrown: unknown[] } {
    const thrown: unknown[] = []
    let resolveLater: (value: unknown) => void = () => {}
    const promise = construct((resolve) => {
      resolveLater = resolve
    })
    try {
      resolveLater(value)
    } catch (error) {
      thrown.push(error)
    }
    return { promise, thrown }
  }

  const lateNative = (executor: (resolve: (value: unknown) => void) => void) =>
    new Promise<unknown>(executor)
  const lateAbortable = (
    executor: (resolve: (value: unknown) => void) => void,
  ) => new AbortablePromise<unknown>(executor)

  /* The microtask turns until `construct()` has settled and a handler on it
     has run. */
  async function turnsToSettle(
    construct: () => Promise<unknown>,
  ): Promise<number> {
    const progress = { settled: false }
    const settle = () => {
      progress.settled = true
    }
    construct().then(settle, settle)
    let turns = 0
    while (!progress.settled && turns < 50) {
      await Promise.resolve()
      turns++
    }
    return turns
  }

  it.each([
    ['a revoked Proxy', revokedProxy(), TypeError],
    [
      'a thenable whose then getter throws',
      {
        get then(): never {
          throw new RangeError('getter')
        },
      },
      RangeError,
    ],
  ])(
    'a late resolve(%s) rejects the promise rather than throwing, as new Promise does',
    async (_name, value, errorClass) => {
      const native = resolveLate(lateNative, value)
      expect(native.thrown).toEqual([])
      await expect(native.promise).rejects.toBeInstanceOf(errorClass)

      const ours = resolveLate(lateAbortable, value)
      expect(ours.thrown).toEqual([])
      await expect(ours.promise).rejects.toBeInstanceOf(errorClass)
    },
  )

  it.each([
    ['a revoked Proxy', revokedProxy(), TypeError],
    [
      'a thenable whose then getter throws',
      {
        get then(): never {
          throw new RangeError('getter')
        },
      },
      RangeError,
    ],
  ])(
    'resolve(%s) inside the executor does not throw into it, as new Promise does not',
    async (_name, value, errorClass) => {
      const settle = (resolve: (value: unknown) => void) => {
        try {
          resolve(value)
        } catch {
          resolve('fallback')
        }
      }

      await expect(new Promise<unknown>(settle)).rejects.toBeInstanceOf(
        errorClass,
      )
      await expect(
        new AbortablePromise<unknown>(settle),
      ).rejects.toBeInstanceOf(errorClass)
    },
  )

  it('a late resolve() of a promise whose constructor getter throws rejects the promise rather than throwing, as new Promise does', async () => {
    const make = () =>
      Object.defineProperty(Promise.resolve('value'), 'constructor', {
        get(): never {
          throw new RangeError('constructor')
        },
      })

    // `then` reads `constructor` to find the species, so native rejects too.
    const native = resolveLate(lateNative, make())
    expect(native.thrown).toEqual([])
    await expect(native.promise).rejects.toBeInstanceOf(RangeError)

    const ours = resolveLate(lateAbortable, make())
    expect(ours.thrown).toEqual([])
    await expect(ours.promise).rejects.toBeInstanceOf(RangeError)
  })

  const throwingOwnThen = () =>
    Object.assign(Promise.resolve('value'), {
      then(): never {
        throw new RangeError('own then')
      },
    })

  it('a late resolve() of a native promise whose own then throws rejects the promise rather than throwing, as new Promise does', async () => {
    const native = resolveLate(lateNative, throwingOwnThen())
    expect(native.thrown).toEqual([])
    await expect(native.promise).rejects.toBeInstanceOf(RangeError)

    const ours = resolveLate(lateAbortable, throwingOwnThen())
    expect(ours.thrown).toEqual([])
    await expect(ours.promise).rejects.toBeInstanceOf(RangeError)
  })

  it('resolve() of a native promise whose own then throws, inside the executor, rejects the promise rather than throwing into it', async () => {
    const settle = (resolve: (value: unknown) => void) => {
      try {
        resolve(throwingOwnThen())
      } catch {
        resolve('fallback')
      }
    }

    await expect(new Promise<unknown>(settle)).rejects.toBeInstanceOf(
      RangeError,
    )
    await expect(new AbortablePromise<unknown>(settle)).rejects.toBeInstanceOf(
      RangeError,
    )
  })

  it('reads the then of a native promise once, as new Promise does', async () => {
    // A getter that throws the second time it is read: native resolve reads
    // `then` once, to adopt the promise, so the promise fulfils.
    const make = () => {
      const promise = Promise.resolve('value')
      const then = Reflect.get(Promise.prototype, 'then') as unknown
      let reads = 0
      return Object.defineProperty(promise, 'then', {
        get(): unknown {
          reads++
          if (reads > 1) {
            throw new RangeError('second read')
          }
          return then
        },
      })
    }

    const native = resolveLate(lateNative, make())
    expect(native.thrown).toEqual([])
    await expect(native.promise).resolves.toBe('value')

    const ours = resolveLate(lateAbortable, make())
    expect(ours.thrown).toEqual([])
    await expect(ours.promise).resolves.toBe('value')
  })

  /* A native promise whose `constructor` getter counts its reads and throws
     on those listed in `throwOn`. */
  function countedConstructor(throwOn: readonly number[]) {
    let reads = 0
    const promise = Object.defineProperty(
      Promise.resolve('value'),
      'constructor',
      {
        get(): unknown {
          reads++
          if (throwOn.includes(reads)) {
            throw new RangeError(`read ${reads}`)
          }
          return Promise
        },
      },
    )
    return { promise, reads: () => reads }
  }

  const resolveEarly = (
    construct: (
      executor: (resolve: (value: unknown) => void) => void,
    ) => Promise<unknown>,
    value: unknown,
  ) =>
    construct((resolve) => {
      resolve(value)
    })

  it('reads the constructor of a native promise once, as new Promise does', async () => {
    // Native reads it once, for the species of `then`.
    for (const resolveWith of [
      (construct: typeof lateNative, value: unknown) =>
        resolveLate(construct, value).promise,
      resolveEarly,
    ]) {
      const native = countedConstructor([])
      await expect(resolveWith(lateNative, native.promise)).resolves.toBe(
        'value',
      )
      expect(native.reads()).toBe(1)

      const ours = countedConstructor([])
      await expect(resolveWith(lateAbortable, ours.promise)).resolves.toBe(
        'value',
      )
      expect(ours.reads()).toBe(1)
    }
  })

  it('does not read the constructor of a native promise a second time, so a getter that throws on its second read fulfils it', async () => {
    for (const resolveWith of [
      (construct: typeof lateNative, value: unknown) =>
        resolveLate(construct, value).promise,
      resolveEarly,
    ]) {
      await expect(
        resolveWith(lateNative, countedConstructor([2]).promise),
      ).resolves.toBe('value')
      await expect(
        resolveWith(lateAbortable, countedConstructor([2]).promise),
      ).resolves.toBe('value')
    }
  })

  it('rejects with the error of the first read of the constructor of a native promise, as new Promise does', async () => {
    for (const resolveWith of [
      (construct: typeof lateNative, value: unknown) =>
        resolveLate(construct, value).promise,
      resolveEarly,
    ]) {
      await expect(
        resolveWith(lateNative, countedConstructor([1]).promise),
      ).rejects.toThrow('read 1')
      await expect(
        resolveWith(lateAbortable, countedConstructor([1]).promise),
      ).rejects.toThrow('read 1')
    }
  })

  it('an early resolve() of a promise whose constructor getter throws rejects the promise, in no more turns than new Promise', async () => {
    const make = () =>
      Object.defineProperty(Promise.resolve('value'), 'constructor', {
        get(): never {
          throw new RangeError('constructor')
        },
      })
    const settle = (resolve: (value: unknown) => void) => {
      resolve(make())
    }

    await expect(new Promise<unknown>(settle)).rejects.toBeInstanceOf(
      RangeError,
    )
    await expect(new AbortablePromise<unknown>(settle)).rejects.toBeInstanceOf(
      RangeError,
    )
    expect(
      await turnsToSettle(() => new AbortablePromise(settle)),
    ).toBeLessThanOrEqual(await turnsToSettle(() => new Promise(settle)))
  })

  it('settles in no more turns than new Promise when it resolves with a native promise', async () => {
    // A native promise is followed by calling its `then`; always following it
    // through a promise resolved with it costs two more turns.
    const settle = (resolve: (value: unknown) => void) => {
      resolve(Promise.resolve('value'))
    }

    expect(
      await turnsToSettle(() => new AbortablePromise(settle)),
    ).toBeLessThanOrEqual(await turnsToSettle(() => new Promise(settle)))
  })

  it.each([
    ['a revoked Proxy, whose then cannot be read', () => revokedProxy()],
    ['a native promise whose own then throws', () => throwingOwnThen()],
    [
      'a native promise whose constructor getter throws',
      () => countedConstructor([1]).promise,
    ],
  ])(
    'a rejection by a late resolve() of %s claims the settlement, so a later abort() leaves the signal alone',
    async (_name, make) => {
      let context: { readonly signal: AbortSignal } | undefined
      let resolveLater: (value: unknown) => void = () => {}
      const ap = new AbortablePromise<unknown>((resolve, _reject, ctx) => {
        context = ctx
        void ctx.signal
        resolveLater = resolve
      })

      resolveLater(make())
      await expect(ap).rejects.toBeInstanceOf(Error)
      ap.abort()

      expect(context?.signal.aborted).toBe(false)
    },
  )

  it('an executor resolving with a hostile thenable is still abortable', async () => {
    const hostileThenable = hostileProxy({ then() {} })
    const ap = new AbortablePromise<string>((resolve) =>
      resolve(hostileThenable as never),
    )

    ap.abort()

    await expect(ap).rejects.toSatisfy(isAbortError)
  })

  const hostileMembers = [
    ['a Proxy whose getPrototypeOf trap throws', () => hostileProxy({})],
    ['a revoked Proxy', () => revokedProxy()],
  ] as const

  const fanIn = {
    all: (members: unknown[]) => AbortablePromise.all(members),
    race: (members: unknown[]) => AbortablePromise.race(members),
    any: (members: unknown[]) => AbortablePromise.any(members),
    allSettled: (members: unknown[]) => AbortablePromise.allSettled(members),
  }

  describe.each(Object.keys(fanIn) as (keyof typeof fanIn)[])(
    'aborting %s()',
    (combinator) => {
      it.each(hostileMembers)(
        'aborts every abortable member, with %s among them',
        async (_name, makeHostile) => {
          const before = new AbortablePromise<string>(() => {})
          const after = new AbortablePromise<string>(() => {})
          const afterThat = new AbortablePromise<string>(() => {})

          const combined = fanIn[combinator]([
            before,
            makeHostile(),
            after,
            afterThat,
          ])

          expect(() => combined.abort()).not.toThrow()

          await expect(combined).rejects.toSatisfy(isAbortError)
          await expect(before).rejects.toSatisfy(isAbortError)
          await expect(after).rejects.toSatisfy(isAbortError)
          await expect(afterThat).rejects.toSatisfy(isAbortError)
        },
      )

      it('skips a member whose prototype has been swapped, and aborts the rest', async () => {
        // A swapped member has lost `abort()`. With `null` or `Object.prototype`
        // it is no thenable either, so the combinator took it as a plain value.
        const swapped = [Promise.prototype, Object.prototype, null].map(
          (prototype) => {
            const member = new AbortablePromise<string>(() => {})
            Object.setPrototypeOf(member, prototype)
            return member
          },
        )
        const outcomes = swapped.map((member) =>
          Promise.prototype.then.call(
            member,
            () => 'fulfilled',
            () => 'rejected',
          ),
        )
        const after = new AbortablePromise<string>(() => {})

        const combined = fanIn[combinator]([...swapped, after])

        expect(() => combined.abort()).not.toThrow()

        await expect(combined).rejects.toSatisfy(isAbortError)
        await expect(after).rejects.toSatisfy(isAbortError)
        await expect(
          Promise.race([...outcomes, Promise.resolve('pending')]),
        ).resolves.toBe('pending')
      })

      it('aborts a subclass instance', async () => {
        class Sub<T> extends AbortablePromise<T> {}
        const member = new Sub<string>(() => {})

        const combined = fanIn[combinator]([member])
        combined.abort()

        await expect(combined).rejects.toSatisfy(isAbortError)
        await expect(member).rejects.toSatisfy(isAbortError)
      })

      it('calls the abort() override of a subclass member, as the then link does', async () => {
        const overridden = vi.fn()
        class Sticky<T> extends AbortablePromise<T> {
          override abort(): void {
            overridden()
          }
        }
        const member = new Sticky<string>(() => {})
        const derived = member.then((value) => value)

        const combined = fanIn[combinator]([member])
        combined.abort()
        const viaLink = fanIn[combinator]([derived])
        viaLink.abort()

        await expect(combined).rejects.toSatisfy(isAbortError)
        await expect(viaLink).rejects.toSatisfy(isAbortError)
        // The combinator called it for `member`, and the `then` link did.
        expect(overridden).toHaveBeenCalledTimes(2)
      })

      it('aborts the other members when a member’s abort() throws, and throws the first error after the last', async () => {
        class Throwing<T> extends AbortablePromise<T> {
          override abort(): never {
            throw new RangeError('first')
          }
        }
        const assigned = new AbortablePromise<string>(() => {})
        assigned.abort = () => {
          throw new TypeError('second')
        }
        const subclass = new Throwing<string>(() => {})
        const before = new AbortablePromise<string>(() => {})
        const after = new AbortablePromise<string>(() => {})

        const combined = fanIn[combinator]([before, subclass, assigned, after])
        // Aborting rejects the combined promise whether or not a member throws.
        combined.catch(() => {})

        expect(() => combined.abort()).toThrow(new RangeError('first'))

        await expect(combined).rejects.toSatisfy(isAbortError)
        await expect(before).rejects.toSatisfy(isAbortError)
        await expect(after).rejects.toSatisfy(isAbortError)
      })

      it('calls an abort spied on a member, or patched on the prototype', async () => {
        const member = new AbortablePromise<string>(() => {})
        const spy = vi.spyOn(member, 'abort')
        const patched = new AbortablePromise<string>(() => {})
        const prototypeSpy = vi.spyOn(AbortablePromise.prototype, 'abort')

        try {
          const combined = fanIn[combinator]([member, patched])
          combined.abort()

          await expect(combined).rejects.toSatisfy(isAbortError)
          await expect(member).rejects.toSatisfy(isAbortError)
          await expect(patched).rejects.toSatisfy(isAbortError)
          expect(spy).toHaveBeenCalledTimes(1)
          expect(prototypeSpy.mock.contexts).toContain(patched)
        } finally {
          prototypeSpy.mockRestore()
        }
      })

      it('aborts the members after a derived one whose upstream abort() throws', async () => {
        // `then`'s upstream link calls `abort()` on the promise it was chained
        // from, so the derived member's abort throws what that one throws.
        const source = new AbortablePromise<string>(() => {})
        source.abort = () => {
          throw new RangeError('refused')
        }
        const after = new AbortablePromise<string>(() => {})
        const derived = source.then((value) => value)

        const combined = fanIn[combinator]([derived, after])
        // Aborting rejects the combined promise whether or not the link throws.
        combined.catch(() => {})

        expect(() => combined.abort()).toThrow(RangeError)

        await expect(after).rejects.toSatisfy(isAbortError)
        await expect(derived).rejects.toSatisfy(isAbortError)
      })

      it.each([
        [
          'a prototype of null',
          (member: AbortablePromise<string>) =>
            Object.setPrototypeOf(member, null) as unknown,
        ],
        [
          'Object.prototype',
          (member: AbortablePromise<string>) =>
            Object.setPrototypeOf(member, Object.prototype) as unknown,
        ],
        [
          'an own then that is not a function',
          (member: AbortablePromise<string>) =>
            Object.assign(member, { then: undefined }) as unknown,
        ],
        [
          'a then getter that throws',
          (member: AbortablePromise<string>) =>
            Object.defineProperty(member, 'then', {
              get(): never {
                throw new RangeError('then')
              },
            }) as unknown,
        ],
      ])(
        'creates no unhandled rejection by aborting a member the combinator never subscribed to: %s',
        async (_name, unsubscribe) => {
          // `Promise.all` treats the member as a plain value, so it attached no
          // handler; aborting it would reject it with nobody listening.
          const shaped = unsubscribe(new AbortablePromise<string>(() => {}))
          const subscribed = new AbortablePromise<string>(() => {})

          const unhandled = await unhandledDuring(() => {
            const combined = fanIn[combinator]([shaped, subscribed])
            combined.abort()
            void combined.catch(() => {})
          })

          expect(unhandled).toEqual([])
          await expect(subscribed).rejects.toSatisfy(isAbortError)
        },
      )

      it('skips a member whose prototype is swapped after the combinator was made, and aborts the rest', async () => {
        const swapped = new AbortablePromise<string>(() => {})
        const after = new AbortablePromise<string>(() => {})
        const combined = fanIn[combinator]([swapped, after])
        Object.setPrototypeOf(swapped, Promise.prototype)

        expect(() => combined.abort()).not.toThrow()

        await expect(combined).rejects.toSatisfy(isAbortError)
        await expect(after).rejects.toSatisfy(isAbortError)
      })

      it('fixes the members to abort when the combinator is made', async () => {
        // Its `then` is no function now, so the combinator took it as a plain
        // value; restoring `then` afterwards does not make it a member to abort.
        const member = new AbortablePromise<string>(() => {})
        const abort = vi.spyOn(member, 'abort')
        void Object.assign(member, { then: undefined })
        const after = new AbortablePromise<string>(() => {})
        const combined = fanIn[combinator]([member, after])
        Reflect.deleteProperty(member, 'then')

        combined.abort()

        await expect(combined).rejects.toSatisfy(isAbortError)
        await expect(after).rejects.toSatisfy(isAbortError)
        expect(abort).not.toHaveBeenCalled()
      })

      it('skips a member whose prototype is a Proxy that throws, and aborts the rest', async () => {
        const member = new AbortablePromise<string>(() => {})
        Object.setPrototypeOf(member, hostileProxy(AbortablePromise.prototype))
        const after = new AbortablePromise<string>(() => {})

        const combined = fanIn[combinator]([member, after])

        expect(() => combined.abort()).not.toThrow()
        await expect(combined).rejects.toSatisfy(isAbortError)
        await expect(after).rejects.toSatisfy(isAbortError)
      })

      it('skips a forgery with no private field, and aborts the rest', async () => {
        const forgery = Object.create(AbortablePromise.prototype) as unknown
        const after = new AbortablePromise<string>(() => {})

        const combined = fanIn[combinator]([forgery, after])

        expect(() => combined.abort()).not.toThrow()
        await expect(combined).rejects.toSatisfy(isAbortError)
        await expect(after).rejects.toSatisfy(isAbortError)
      })

      it('leaves one AbortError unhandled when a member’s own then subscribes nothing', async () => {
        const member = new AbortablePromise<string>(() => {})
        void Object.assign(member, { then: () => {} })

        const unhandled = await unhandledDuring(() => {
          const combined = fanIn[combinator]([member])
          combined.abort()
          void combined.catch(() => {})
        })

        expect(unhandled).toHaveLength(1)
        expect(unhandled[0]).toSatisfy(isAbortError)
      })

      it('does not throw for a Proxy with no traps over an AbortablePromise', async () => {
        const inner = new AbortablePromise<string>(() => {})
        const after = new AbortablePromise<string>(() => {})

        const combined = fanIn[combinator]([new Proxy(inner, {}), after])

        expect(() => combined.abort()).not.toThrow()
        await expect(combined).rejects.toSatisfy(isAbortError)
        await expect(after).rejects.toSatisfy(isAbortError)
        inner.abort()
        await expect(inner).rejects.toSatisfy(isAbortError)
      })

      it('does not abort a member through a binding Proxy over it', async () => {
        // A Proxy has no private field of the class, so it is no member to
        // abort, whatever its traps do with methods.
        let aborted = false
        const target = new AbortablePromise<string>(
          (_resolve, _reject, ctx) => {
            ctx.signal.addEventListener('abort', () => {
              aborted = true
            })
          },
        )
        const binding = bindingProxy(target)

        const combined = fanIn[combinator]([binding])
        combined.abort()

        await expect(combined).rejects.toSatisfy(isAbortError)
        expect(aborted).toBe(false)
        target.abort()
        await expect(target).rejects.toSatisfy(isAbortError)
      })
    },
  )

  it('of() does not abort an AbortablePromise through a binding Proxy over it', async () => {
    let aborted = false
    const target = new AbortablePromise<string>((_resolve, _reject, ctx) => {
      ctx.signal.addEventListener('abort', () => {
        aborted = true
      })
    })

    const wrapped = AbortablePromise.of(bindingProxy(target))
    wrapped.abort()

    await expect(wrapped).rejects.toSatisfy(isAbortError)
    expect(aborted).toBe(false)
    target.abort()
    await expect(target).rejects.toSatisfy(isAbortError)
  })

  it('an executor resolving with a binding Proxy over an AbortablePromise does not abort it', async () => {
    let aborted = false
    const target = new AbortablePromise<string>((_resolve, _reject, ctx) => {
      ctx.signal.addEventListener('abort', () => {
        aborted = true
      })
    })

    const outer = new AbortablePromise<string>((resolve) =>
      resolve(bindingProxy(target)),
    )
    outer.abort()

    await expect(outer).rejects.toSatisfy(isAbortError)
    expect(aborted).toBe(false)
    target.abort()
    await expect(target).rejects.toSatisfy(isAbortError)
  })

  it('does not mistake a Proxy with no traps over an AbortablePromise for one', async () => {
    // No private field, so `of` wraps it; calling `then` on the Proxy reaches
    // `Promise.prototype.then` with the Proxy as its receiver, which throws,
    // as it does for `Promise.resolve`.
    const inner = new AbortablePromise<string>(() => {})
    const proxy = new Proxy(inner, {})

    const wrapped = AbortablePromise.of(proxy)

    expect(wrapped).not.toBe(proxy)
    await expect(Promise.resolve(proxy)).rejects.toBeInstanceOf(TypeError)
    await expect(wrapped).rejects.toBeInstanceOf(TypeError)
    inner.abort()
    await expect(inner).rejects.toSatisfy(isAbortError)
  })

  it('an executor resolving with a subclass instance calls its abort() override', async () => {
    const overridden = vi.fn()
    class Sticky<T> extends AbortablePromise<T> {
      override abort(): void {
        overridden()
      }
    }
    const delegate = new Sticky<string>(() => {})
    const outer = new AbortablePromise<string>((resolve) => resolve(delegate))

    outer.abort()

    await expect(outer).rejects.toSatisfy(isAbortError)
    expect(overridden).toHaveBeenCalledTimes(1)
  })

  it('an executor resolving with a delegate calls an abort spied on it, or patched on the prototype', async () => {
    const spied = new AbortablePromise<string>(() => {})
    const spy = vi.spyOn(spied, 'abort')
    const patched = new AbortablePromise<string>(() => {})
    const prototypeSpy = vi.spyOn(AbortablePromise.prototype, 'abort')

    try {
      const outerSpied = new AbortablePromise<string>((resolve) =>
        resolve(spied),
      )
      const outerPatched = new AbortablePromise<string>((resolve) =>
        resolve(patched),
      )
      outerSpied.abort()
      outerPatched.abort()

      await expect(outerSpied).rejects.toSatisfy(isAbortError)
      await expect(outerPatched).rejects.toSatisfy(isAbortError)
      await expect(spied).rejects.toSatisfy(isAbortError)
      await expect(patched).rejects.toSatisfy(isAbortError)
      expect(spy).toHaveBeenCalledTimes(1)
      expect(prototypeSpy.mock.contexts).toContain(patched)
    } finally {
      prototypeSpy.mockRestore()
    }
  })

  it('aborting an executor that resolved with a delegate whose abort throws rejects it, and then throws', async () => {
    const throwing = new AbortablePromise<string>(() => {})
    throwing.abort = () => {
      throw new RangeError('refused')
    }
    const outer = new AbortablePromise<string>((resolve) => resolve(throwing))

    expect(() => outer.abort()).toThrow(RangeError)

    await expect(outer).rejects.toSatisfy(isAbortError)
  })

  it('aborting a derived promise aborts the delegate its handler returned, after an upstream abort() that throws', async () => {
    // The derived promise has two links: to its source, from `then`, and to the
    // delegate, from the handler's return. The first throws.
    const source = new AbortablePromise<number>((resolve) => resolve(1))
    source.abort = () => {
      throw new RangeError('refused')
    }
    const work = new AbortablePromise<string>(() => {})
    let handlerRan!: () => void
    const ran = new Promise<void>((resolve) => {
      handlerRan = resolve
    })
    const derived = source.then(() => {
      handlerRan()
      return work
    })
    await ran

    expect(() => derived.abort()).toThrow(RangeError)

    await expect(derived).rejects.toSatisfy(isAbortError)
    await expect(work).rejects.toSatisfy(isAbortError)
  })

  it('an executor resolving with a Proxy with no traps over an AbortablePromise does not throw when aborted', async () => {
    const inner = new AbortablePromise<string>(() => {})
    const outer = new AbortablePromise<string>((resolve) =>
      resolve(new Proxy(inner, {})),
    )

    expect(() => outer.abort()).not.toThrow()
    await expect(outer).rejects.toSatisfy(isAbortError)
    inner.abort()
    await expect(inner).rejects.toSatisfy(isAbortError)
  })

  it('proxy.then(f).abort() on a binding Proxy still aborts the target', async () => {
    let aborted = false
    const target = new AbortablePromise<string>((_resolve, _reject, ctx) => {
      ctx.signal.addEventListener('abort', () => {
        aborted = true
      })
    })

    const derived = bindingProxy(target).then((value) => value)
    derived.abort()

    await expect(derived).rejects.toSatisfy(isAbortError)
    await expect(target).rejects.toSatisfy(isAbortError)
    expect(aborted).toBe(true)
  })

  it('leaves no unhandled rejection when a delegate is aborted by a resolve that comes after the abort', async () => {
    const unhandled = await unhandledDuring(() => {
      const work = new AbortablePromise<string>(() => {})
      let resolveLater: (value: unknown) => void = () => {}
      const outer = new AbortablePromise<unknown>((resolve) => {
        resolveLater = resolve
      })
      outer.abort()
      void outer.catch(() => {})
      resolveLater(work)
    })

    expect(unhandled).toEqual([])
  })

  it('a resolve that comes after the abort neither throws nor leaves a rejection unhandled when the delegate’s abort() throws', async () => {
    class Throwing<T> extends AbortablePromise<T> {
      override abort(): void {
        super.abort()
        throw new RangeError('refused')
      }
    }
    const thrown: unknown[] = []
    let delegate: Throwing<string> | undefined

    const unhandled = await unhandledDuring(() => {
      delegate = new Throwing<string>(() => {})
      let resolveLater: (value: unknown) => void = () => {}
      const outer = new AbortablePromise<unknown>((resolve) => {
        resolveLater = resolve
      })
      outer.abort()
      void outer.catch(() => {})
      try {
        resolveLater(delegate)
      } catch (error) {
        thrown.push(error)
      }
    })

    expect(thrown).toEqual([])
    expect(unhandled).toEqual([])
    await expect(delegate).rejects.toSatisfy(isAbortError)
  })

  it('abortOn with a signal that has already aborted throws an upstream abort() error to its caller', async () => {
    const source = new AbortablePromise<string>(() => {})
    source.abort = () => {
      throw new RangeError('refused')
    }
    const derived = source.then((value) => value)

    expect(() => derived.abortOn(AbortSignal.abort())).toThrow(RangeError)

    await expect(derived).rejects.toSatisfy(isAbortError)
  })

  it('releases the signal listeners of a promise when an upstream abort() throws', async () => {
    const controller = new AbortController()
    const source = new AbortablePromise<string>(() => {})
    source.abort = () => {
      throw new RangeError('refused')
    }
    const derived = source.then((value) => value).abortOn(controller.signal)

    expect(() => derived.abort()).toThrow(RangeError)

    await expect(derived).rejects.toSatisfy(isAbortError)
    expect(listeners(controller.signal)).toHaveLength(0)
  })

  it('an executor resolving with a delegate whose prototype is swapped afterwards is abortable, and does not abort it', async () => {
    const delegate = new AbortablePromise<string>(() => {})
    const outer = new AbortablePromise<string>((resolve) => resolve(delegate))
    Object.setPrototypeOf(delegate, Promise.prototype)
    // What the delegate settles with, recorded through the native `then`.
    const delegateSettled: string[] = []
    void Promise.prototype.then.call(
      delegate,
      () => delegateSettled.push('fulfilled'),
      () => delegateSettled.push('rejected'),
    )

    expect(() => outer.abort()).not.toThrow()

    await expect(outer).rejects.toSatisfy(isAbortError)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(delegateSettled).toEqual([])
  })

  it('skips a delegate swapped to a prototype that does not inherit AbortablePromise.prototype but has an abort(), and aborts one swapped to a subclass prototype', async () => {
    class Sub<T> extends AbortablePromise<T> {}
    const protoAbort = vi.fn()
    const withAbort = Object.assign(
      Object.create(Promise.prototype) as object,
      {
        abort: protoAbort,
      },
    )
    const settledOf = async (delegate: object) => {
      const settled: string[] = []
      void Promise.prototype.then.call(
        delegate,
        () => settled.push('fulfilled'),
        () => settled.push('rejected'),
      )
      await new Promise((resolve) => setTimeout(resolve, 0))
      return settled
    }
    const swapAndAbort = async (prototype: object | null) => {
      const delegate = new AbortablePromise<string>(() => {})
      const outer = new AbortablePromise<string>((resolve) => resolve(delegate))
      Object.setPrototypeOf(delegate, prototype)
      expect(() => outer.abort()).not.toThrow()
      await expect(outer).rejects.toSatisfy(isAbortError)
      return settledOf(delegate)
    }

    expect(await swapAndAbort(withAbort)).toEqual([])
    expect(protoAbort).not.toHaveBeenCalled()
    expect(await swapAndAbort(Sub.prototype)).toEqual(['rejected'])
  })

  it('follows a delegate in the turns its then allows', async () => {
    class Sub<T> extends Promise<T> {}
    class Overriding<T> extends Promise<T> {
      override then<A = T, B = never>(
        onFulfilled?: ((value: T) => A | PromiseLike<A>) | null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onRejected?: ((reason: any) => B | PromiseLike<B>) | null,
      ): Promise<A | B> {
        return super.then(onFulfilled, onRejected)
      }
    }
    const spied = () => {
      const promise = Promise.resolve('value')
      return Object.assign(promise, {
        then(...args: Parameters<Promise<string>['then']>) {
          return Promise.prototype.then.apply(promise, args)
        },
      })
    }
    const turns = (make: () => unknown) =>
      turnsToSettle(() => new AbortablePromise((resolve) => resolve(make())))

    // The `then` captured at load is called at once, which a native resolve
    // function does not.
    expect(await turns(() => Sub.resolve('value'))).toBe(2)
    expect(
      await turns(() =>
        Object.defineProperty(Promise.resolve('value'), 'constructor', {
          value: Object,
        }),
      ),
    ).toBe(2)
    // A promise with another `then` has it called from a job: four turns.
    expect(await turns(() => Overriding.resolve('value'))).toBe(4)
    expect(await turns(() => AbortablePromise.resolve('value'))).toBe(4)
    expect(await turns(spied)).toBe(4)
  })

  it('follows a delegate later than new Promise does exactly when its then is not the one captured at load', async () => {
    class Sub<T> extends Promise<T> {}
    class Overriding<T> extends Promise<T> {
      override then<A = T, B = never>(
        onFulfilled?: ((value: T) => A | PromiseLike<A>) | null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onRejected?: ((reason: any) => B | PromiseLike<B>) | null,
      ): Promise<A | B> {
        return super.then(onFulfilled, onRejected)
      }
    }
    const turnsBoth = async (make: () => unknown) => ({
      abortable: await turnsToSettle(
        () => new AbortablePromise((resolve) => resolve(make())),
      ),
      native: await turnsToSettle(
        () => new Promise((resolve) => resolve(make())),
      ),
    })

    // The captured `then` is called at once.
    for (const make of [
      () => Promise.resolve('value'),
      () => Sub.resolve('value'),
      () =>
        Object.defineProperty(Promise.resolve('value'), 'constructor', {
          value: Object,
        }),
    ]) {
      const { abortable, native } = await turnsBoth(make)
      expect(abortable).toBeLessThan(native)
    }
    // Any other `then` is called from a job.
    for (const make of [
      () => Overriding.resolve('value'),
      () => AbortablePromise.resolve('value'),
      () => ({
        then(onFulfilled: (value: string) => void) {
          onFulfilled('value')
        },
      }),
      () => {
        const promise = Promise.resolve('value')
        return Object.assign(promise, {
          then(...args: Parameters<Promise<string>['then']>) {
            return Promise.prototype.then.apply(promise, args)
          },
        })
      },
    ]) {
      const { abortable, native } = await turnsBoth(make)
      expect(abortable).toBeGreaterThan(native)
    }
  })

  it('follows a native promise from another realm as before, in four turns', async () => {
    // Its `constructor` is not this realm's `Promise`, and neither is its
    // `then`, so it is called from a job, as `Promise.resolve` wrapping it did.
    expect(
      await turnsToSettle(
        () =>
          new AbortablePromise((resolve) =>
            resolve(vm.runInNewContext('Promise.resolve(1)')),
          ),
      ),
    ).toBe(4)
  })

  it('leaves one AbortError unhandled when a delegate’s own then subscribes nothing', async () => {
    const delegate = new AbortablePromise<string>(() => {})
    void Object.assign(delegate, { then: () => {} })

    const unhandled = await unhandledDuring(() => {
      const outer = new AbortablePromise<string>((resolve) => resolve(delegate))
      outer.abort()
      void outer.catch(() => {})
    })

    expect(unhandled).toHaveLength(1)
    expect(unhandled[0]).toSatisfy(isAbortError)
  })

  it('chains the promise it follows a delegate with through the then captured at load', async () => {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- restored below
    const original = Promise.prototype.then
    Promise.prototype.then = function (): never {
      throw new RangeError('patched')
    }
    let outer: AbortablePromise<string> | undefined
    try {
      outer = new AbortablePromise<string>((resolve) =>
        resolve({
          then(onFulfilled: (value: string) => void) {
            onFulfilled('value')
          },
        } as PromiseLike<string>),
      )
    } finally {
      Promise.prototype.then = original
    }

    await expect(outer).resolves.toBe('value')
  })

  it('does not call a Promise.prototype.then patched after load while resolve runs, for a plain thenable, a native promise or a Promise subclass instance', async () => {
    class Sub<T> extends Promise<T> {}
    // eslint-disable-next-line @typescript-eslint/unbound-method -- restored below
    const original = Promise.prototype.then
    for (const make of [
      () => ({
        then(onFulfilled: (value: string) => void) {
          onFulfilled('value')
        },
      }),
      () => Promise.resolve('value'),
      () => Sub.resolve('value'),
    ]) {
      let calls = 0
      Promise.prototype.then = function (
        this: Promise<unknown>,
        ...args: Parameters<Promise<unknown>['then']>
      ) {
        calls++
        return original.apply(this, args)
      } as typeof original
      let outer: AbortablePromise<string> | undefined
      try {
        outer = new AbortablePromise<string>((resolve) =>
          resolve(make() as PromiseLike<string>),
        )
        expect(calls).toBe(0)
      } finally {
        Promise.prototype.then = original
      }
      await expect(outer).resolves.toBe('value')
    }
  })

  /**
   * Delegates, with whether each fulfils while a patch that throws is still in
   * place when the job that calls its `then` runs.
   */
  const delegatesUnderPatchedThen: [
    string,
    () => unknown,
    'fulfils' | 'rejects',
  ][] = [
    [
      'a plain thenable',
      () => ({ then: (fulfil: (value: string) => void) => fulfil('value') }),
      'fulfils',
    ],
    [
      'a promise from another realm',
      () => vm.runInNewContext('Promise.resolve("value")'),
      'fulfils',
    ],
    [
      'a subclass that overrides then',
      () => {
        class Overriding<T> extends Promise<T> {
          override then<A = T, B = never>(
            onFulfilled?: ((value: T) => A | PromiseLike<A>) | null,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onRejected?: ((reason: any) => B | PromiseLike<B>) | null,
          ): Promise<A | B> {
            return super.then(onFulfilled, onRejected)
          }
        }
        return Overriding.resolve('value')
      },
      'rejects',
    ],
    [
      'a thenable that wraps a native promise',
      () => ({
        then: (
          fulfil: (value: string) => void,
          reject: (reason: unknown) => void,
        ) => void Promise.resolve('value').then(fulfil, reject),
      }),
      'rejects',
    ],
    ['an AbortablePromise', () => AbortablePromise.resolve('value'), 'rejects'],
  ]

  /**
   * The settled states `resolveUnderPatchedThen` reports for a promise that
   * fulfils and one that rejects.
   */
  const fulfilled = { status: 'fulfilled', value: 'value' }
  const rejected = { status: 'rejected', reason: new RangeError('patched') }

  /**
   * Resolves one promise inside its executor and one with a later `resolve`,
   * both with `delegate`, with `Promise.prototype.then` patched to throw.
   * `'construction'` has the patch in place only while the promises are made,
   * so it is undone before the job that calls the delegate's `then` runs.
   * `'job'` puts it in place from a microtask queued ahead of that job, and
   * undoes it ten turns later. `'held'` puts it in place before the promises
   * are made, and keeps it through the same ten turns.
   * Returns how the two promises settled, as `settled`, and what the later
   * `resolve` threw to its caller, as `thrownToCaller`.
   */
  async function resolveUnderPatchedThen(
    delegate: unknown,
    patchedAround: 'construction' | 'held' | 'job',
  ) {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- restored below
    const original = Promise.prototype.then
    const patch = () => {
      Promise.prototype.then = function (): never {
        throw new RangeError('patched')
      }
    }
    let inExecutor: AbortablePromise<string> | undefined
    let later: AbortablePromise<string> | undefined
    let resolveLater!: (value: PromiseLike<string>) => void
    let thrownToCaller: unknown
    let restored = false
    // The test runner calls `then` on the promise a test returns, when the test
    // first yields: let it, before a patch that throws is put in place.
    await Promise.resolve()
    try {
      if (patchedAround !== 'job') {
        patch()
      } else {
        queueMicrotask(() => {
          if (!restored) patch()
        })
      }
      inExecutor = new AbortablePromise<string>((resolve) =>
        resolve(delegate as PromiseLike<string>),
      )
      later = new AbortablePromise<string>((resolve) => {
        resolveLater = resolve
      })
      try {
        resolveLater(delegate as PromiseLike<string>)
      } catch (error) {
        thrownToCaller = error
      }
      if (patchedAround !== 'construction') {
        for (let turn = 0; turn < 10; turn++) {
          await Promise.resolve()
        }
      }
    } finally {
      restored = true
      Promise.prototype.then = original
    }
    return {
      settled: Promise.allSettled([inExecutor, later]),
      thrownToCaller,
    }
  }

  it.each(delegatesUnderPatchedThen)(
    'fulfils with %s while a Promise.prototype.then that throws is patched and undone before the job that calls the delegate’s then, in the executor and in a later resolve',
    async (_, make) => {
      const { settled, thrownToCaller } = await resolveUnderPatchedThen(
        make(),
        'construction',
      )

      expect(thrownToCaller).toBeUndefined()
      expect(await settled).toEqual([fulfilled, fulfilled])
    },
  )

  it.each(
    delegatesUnderPatchedThen.map(
      ([name, make, outcome]) => [outcome, name, make] as const,
    ),
  )(
    '%s with %s while a Promise.prototype.then that throws is put in place before the promises are made and kept in place when the job that calls the delegate’s then runs',
    async (outcome, _, make) => {
      const { settled, thrownToCaller } = await resolveUnderPatchedThen(
        make(),
        'held',
      )

      expect(thrownToCaller).toBeUndefined()
      expect(await settled).toEqual(
        outcome === 'fulfils' ? [fulfilled, fulfilled] : [rejected, rejected],
      )
    },
  )

  it.each(
    delegatesUnderPatchedThen.map(
      ([name, make, outcome]) => [outcome, name, make] as const,
    ),
  )(
    '%s with %s while a Promise.prototype.then that throws is still patched when the job that calls the delegate’s then runs',
    async (outcome, _, make) => {
      const { settled, thrownToCaller } = await resolveUnderPatchedThen(
        make(),
        'job',
      )

      expect(thrownToCaller).toBeUndefined()
      expect(await settled).toEqual(
        outcome === 'fulfils' ? [fulfilled, fulfilled] : [rejected, rejected],
      )
    },
  )

  it.each(['construction', 'held'] as const)(
    'rejects with a native promise while a Promise.prototype.then that throws is patched (%s), and a later resolve throws nothing to its caller',
    async (patchedAround) => {
      const delegate = Promise.resolve('value')

      const { settled, thrownToCaller } = await resolveUnderPatchedThen(
        delegate,
        patchedAround,
      )

      expect(thrownToCaller).toBeUndefined()
      expect(await settled).toEqual([rejected, rejected])
    },
  )

  it('fulfils with a native promise while a Promise.prototype.then that throws is still patched when the job that calls the delegate’s then runs', async () => {
    const { settled, thrownToCaller } = await resolveUnderPatchedThen(
      Promise.resolve('value'),
      'job',
    )

    expect(thrownToCaller).toBeUndefined()
    expect(await settled).toEqual([fulfilled, fulfilled])
  })

  it('compares the then of a delegate with the Promise.prototype.then captured at load', async () => {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- restored below
    const original = Promise.prototype.then
    const patched = function (
      this: Promise<unknown>,
      ...args: Parameters<Promise<unknown>['then']>
    ) {
      return original.apply(this, args)
    }
    const delegate = Promise.resolve('value')
    let outer: AbortablePromise<string> | undefined
    Promise.prototype.then = patched as typeof original
    try {
      outer = new AbortablePromise<string>((resolve) => resolve(delegate))
    } finally {
      Promise.prototype.then = original
    }

    // Its `then` is no longer the captured one, so it is called from a job.
    expect(await turnsToSettle(() => outer)).toBe(4)
  })

  it('an executor resolving with a forgery with no private field is abortable, and abort() does not throw', async () => {
    const forgery = Object.create(
      AbortablePromise.prototype,
    ) as PromiseLike<string>
    const outer = new AbortablePromise<string>((resolve) => resolve(forgery))

    expect(() => outer.abort()).not.toThrow()

    await expect(outer).rejects.toSatisfy(isAbortError)
  })

  it('an executor resolving with an AbortablePromise whose prototype is a Proxy that throws follows it', async () => {
    const delegate = AbortablePromise.resolve('value')
    Object.setPrototypeOf(delegate, hostileProxy(AbortablePromise.prototype))

    const outer = new AbortablePromise<string>((resolve) => resolve(delegate))

    await expect(outer).resolves.toBe('value')
  })

  it('follows a delegate with the Promise it captured, not the global one', async () => {
    const delegate = AbortablePromise.resolve('value')
    const OriginalPromise = Promise
    // A stand-in that is no native promise, which a promise made with it could
    // not be chained with `Promise.prototype.then`.
    class Standin<T> {
      readonly #promise: Promise<T>
      constructor(
        executor: (
          resolve: (value: T | PromiseLike<T>) => void,
          reject: (reason?: unknown) => void,
        ) => void,
      ) {
        this.#promise = new OriginalPromise(executor)
      }
      then<U>(onFulfilled: (value: T) => U) {
        return this.#promise.then(onFulfilled)
      }
    }

    let outer: AbortablePromise<string> | undefined
    globalThis.Promise = Standin as unknown as PromiseConstructor
    try {
      outer = new AbortablePromise<string>((resolve) => resolve(delegate))
    } finally {
      globalThis.Promise = OriginalPromise
    }

    await expect(outer).resolves.toBe('value')
  })

  it('calls the species constructor of a Promise subclass delegate before resolve returns', () => {
    // Its `then` is the one `Promise.prototype` has, which is called at once.
    let species = 0
    class Sub<T> extends Promise<T> {
      static override get [Symbol.species]() {
        species++
        return Promise
      }
    }

    let speciesInExecutor = -1
    void new AbortablePromise<string>((resolve) => {
      resolve(Sub.resolve('value'))
      speciesInExecutor = species
    })

    expect(speciesInExecutor).toBe(1)
  })

  it('reads the then of a thenable once, and calls it from a job', async () => {
    let reads = 0
    let calls = 0
    const thenable = {
      get then() {
        reads++
        return (resolve: (value: string) => void) => {
          calls++
          resolve('value')
        }
      },
    }
    let callsInExecutor = -1

    const ap = new AbortablePromise<string>((resolve) => {
      resolve(thenable as never)
      callsInExecutor = calls
    })

    expect(callsInExecutor).toBe(0)
    await expect(ap).resolves.toBe('value')
    expect(reads).toBe(1)
    expect(calls).toBe(1)
  })

  it('an executor resolving with an AbortablePromise whose prototype is a Proxy that throws is abortable, and does not abort it', async () => {
    const delegate = new AbortablePromise<string>(() => {})
    Object.setPrototypeOf(delegate, hostileProxy(AbortablePromise.prototype))
    const outer = new AbortablePromise<string>((resolve) => resolve(delegate))

    expect(() => outer.abort()).not.toThrow()

    await expect(outer).rejects.toSatisfy(isAbortError)
    await expect(
      Promise.race([
        Promise.prototype.then.call(
          delegate,
          () => 'fulfilled',
          () => 'rejected',
        ),
        Promise.resolve('pending'),
      ]),
    ).resolves.toBe('pending')
  })

  it('of() calls the then of a value that inherits Promise.prototype before the executor has returned', async () => {
    let calls = 0
    const lookalike = Object.assign(
      Object.create(Promise.prototype) as object,
      {
        then(resolve: (value: string) => void) {
          calls++
          resolve('value')
        },
      },
    )

    const wrapped = AbortablePromise.of(lookalike as Promise<string>)

    expect(calls).toBe(1)
    await expect(wrapped).resolves.toBe('value')
  })

  it('of() settles an instance of a Promise subclass in two turns', async () => {
    class Sub<T> extends Promise<T> {}

    // `Promise.resolve` would wrap it, which costs two more turns.
    expect(
      await turnsToSettle(() => AbortablePromise.of(Sub.resolve('value'))),
    ).toBe(2)
  })

  it('of() reads the constructor of a native promise once, and resolve() twice, as before', async () => {
    const forOf = countedConstructor([])
    await expect(AbortablePromise.of(forOf.promise)).resolves.toBe('value')
    expect(forOf.reads()).toBe(1)

    const forResolve = countedConstructor([])
    await expect(AbortablePromise.resolve(forResolve.promise)).resolves.toBe(
      'value',
    )
    expect(forResolve.reads()).toBe(2)

    // The second read of `of`, and the third of `resolve`, do not happen.
    await expect(
      AbortablePromise.of(countedConstructor([2]).promise),
    ).resolves.toBe('value')
    await expect(
      AbortablePromise.resolve(countedConstructor([3]).promise),
    ).resolves.toBe('value')
  })

  it('does not consult Symbol.hasInstance to recognise an AbortablePromise or a Promise', async () => {
    const hasInstance = vi.fn(() => false)
    const define = (target: object) =>
      Object.defineProperty(target, Symbol.hasInstance, {
        value: hasInstance,
        configurable: true,
      })
    const ap = new AbortablePromise<string>(() => {})
    const handled: Promise<unknown>[] = []

    define(AbortablePromise)
    define(Promise)
    try {
      expect(AbortablePromise.of(ap)).toBe(ap)
      handled.push(AbortablePromise.of(Promise.resolve('value')))
      const combined = AbortablePromise.all([ap])
      combined.abort()
      handled.push(combined.catch(() => {}))
      const outer = new AbortablePromise<string>((resolve) => resolve(ap))
      outer.abort()
      handled.push(outer.catch(() => {}))
      expect(hasInstance).not.toHaveBeenCalled()
    } finally {
      Reflect.deleteProperty(AbortablePromise, Symbol.hasInstance)
      Reflect.deleteProperty(Promise, Symbol.hasInstance)
    }
    await Promise.all(handled)
  })

  it('of() returns a subclass instance as it is', () => {
    class Sub<T> extends AbortablePromise<T> {}
    const member = new Sub<string>(() => {})

    expect(AbortablePromise.of(member)).toBe(member)
    member.abort()
    member.catch(() => {})
  })

  it('of() wraps an AbortablePromise whose prototype has been swapped, and does not throw', async () => {
    const swapped = AbortablePromise.resolve('value')
    Object.setPrototypeOf(swapped, Promise.prototype)

    const wrapped = AbortablePromise.of(swapped)

    expect(wrapped).not.toBe(swapped)
    await expect(wrapped).resolves.toBe('value')
  })

  it('an executor resolving with an AbortablePromise whose prototype has been swapped aborts only itself', async () => {
    const swapped = new AbortablePromise<string>(() => {})
    Object.setPrototypeOf(swapped, Promise.prototype)
    const swappedSettled: string[] = []
    void Promise.prototype.then.call(
      swapped,
      () => swappedSettled.push('fulfilled'),
      () => swappedSettled.push('rejected'),
    )

    const outer = new AbortablePromise<string>((resolve) => resolve(swapped))

    expect(() => outer.abort()).not.toThrow()
    await expect(outer).rejects.toSatisfy(isAbortError)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(swappedSettled).toEqual([])
  })

  it('of() wraps an AbortablePromise whose prototype is a Proxy that throws, and fulfils as Promise.resolve does', async () => {
    const make = () => {
      const ap = AbortablePromise.resolve('value')
      Object.setPrototypeOf(ap, hostileProxy(AbortablePromise.prototype))
      return ap
    }

    await expect(Promise.resolve(make())).resolves.toBe('value')
    let wrapped: AbortablePromise<unknown> | undefined
    expect(() => {
      wrapped = AbortablePromise.of(make())
    }).not.toThrow()
    await expect(wrapped).resolves.toBe('value')
  })

  it('of() wraps a forgery that has AbortablePromise.prototype but no private field of the class', async () => {
    const forgery = Object.create(AbortablePromise.prototype) as object

    const wrapped = AbortablePromise.of(forgery)

    expect(wrapped).not.toBe(forgery)
    // `then` of the forgery reaches `Promise.prototype.then` with a receiver
    // that is no promise, so, as for `Promise.resolve`, the wrapper rejects.
    await expect(Promise.resolve(forgery)).rejects.toBeInstanceOf(TypeError)
    await expect(wrapped).rejects.toBeInstanceOf(TypeError)
  })

  it('of() and resolve() treat a thenable whose then getter throws, and a promise whose constructor getter throws, as Promise.resolve does', async () => {
    const thenGetter = () => ({
      get then(): never {
        throw new RangeError('then')
      },
    })
    const constructorGetter = () =>
      Object.defineProperty(Promise.resolve('value'), 'constructor', {
        get(): never {
          throw new RangeError('constructor')
        },
      })

    await expect(Promise.resolve(thenGetter())).rejects.toBeInstanceOf(
      RangeError,
    )
    await expect(AbortablePromise.of(thenGetter())).rejects.toBeInstanceOf(
      RangeError,
    )
    await expect(AbortablePromise.resolve(thenGetter())).rejects.toBeInstanceOf(
      RangeError,
    )

    // `Promise.resolve` reads `constructor` and throws, and so does `resolve`.
    // `of` is handed a value, reads it inside its executor, and so rejects.
    expect(() => Promise.resolve(constructorGetter())).toThrow(RangeError)
    expect(() => AbortablePromise.resolve(constructorGetter())).toThrow(
      RangeError,
    )
    await expect(
      AbortablePromise.of(constructorGetter()),
    ).rejects.toBeInstanceOf(RangeError)
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
        (val) => String(val) + ' then fulfilled',
        (reason) => reason + ' then rejected',
      ),
    ).resolves.toEqual('rejected then rejected')

    await expect(
      AbortablePromise.abort().then(
        (val) => String(val) + ' then fulfilled',
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

describe('AbortablePromise signal listeners on a promise that has settled', () => {
  it('reading context.signal adds no listener to it', async () => {
    let context: AbortContext | undefined
    await new AbortablePromise<string>((resolve, _reject, executorContext) => {
      context = executorContext
      resolve('value')
    })

    expect(listeners(context!.signal)).toHaveLength(0)
  })

  it('peer() adds one listener to the shared signal while the peer is pending, and none once it settles', async () => {
    const ap = AbortablePromise.resolve('value')
    await ap
    let signal: AbortSignal | undefined
    let resolvePeer!: (value: string) => void
    const peer = ap.peer<string>((resolve, _reject, context) => {
      signal = context.signal
      resolvePeer = resolve
    })

    expect(listeners(signal!)).toHaveLength(1)

    resolvePeer('peer')
    await peer

    expect(listeners(signal!)).toHaveLength(0)
  })

  it('peer() adds no listener to the shared signal when the peer settles in its executor', async () => {
    const ap = AbortablePromise.resolve('value')
    await ap
    let signal: AbortSignal | undefined
    await ap.peer((resolve, _reject, context) => {
      signal = context.signal
      resolve('peer')
    })

    expect(listeners(signal!)).toHaveLength(0)
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

  describe('on a promise that has settled', () => {
    it.each([
      ['fulfilled', () => AbortablePromise.resolve('value')],
      ['rejected', () => AbortablePromise.reject(new Error('refused'))],
      ['aborted', () => AbortablePromise.abort()],
    ])(
      'abortOn adds no listener to the signal of a promise that has %s',
      async (_, make) => {
        const ap = make()
        await ap.then(
          () => {},
          () => {},
        )
        const controller = new AbortController()

        expect(ap.abortOn(controller.signal)).toBe(ap)

        expect(listeners(controller.signal)).toHaveLength(0)
      },
    )
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
    const controller = new AbortController()
    const ap = AbortablePromise.resolve('value').abortOn(controller.signal)

    await expect(ap).resolves.toEqual('value')

    controller.abort()

    await expect(ap).resolves.toEqual('value')
  })

  it('releases the listener when the promise settles', async () => {
    // A signal outlives the promises bound to it, so a binding that is never
    // released pins its listener — and this whole promise — for the signal's
    // lifetime. Nothing observes the settlement to release it: the release
    // happens inside the bookkeeping that decides settlement.
    const controller = new AbortController()

    const ap = AbortablePromise.resolve('value').abortOn(controller.signal)
    await ap

    expect(listeners(controller.signal)).toHaveLength(0)
  })

  it('releases the listener when the promise is aborted', async () => {
    const controller = new AbortController()

    const ap = new AbortablePromise<string>(() => {}).abortOn(controller.signal)
    ap.abort()

    await expect(ap).rejects.toSatisfy(isAbortError)
    expect(listeners(controller.signal)).toHaveLength(0)
  })

  it('does not accumulate listeners on a long-lived signal', async () => {
    // The shape that used to leak: one signal governing a run of short-lived
    // promises, each of which settles long before the signal ever aborts.
    const controller = new AbortController()
    const added = vi.spyOn(controller.signal, 'addEventListener')

    await Promise.all(
      Array.from({ length: 50 }, (_, index) =>
        AbortablePromise.resolve(index).abortOn(controller.signal),
      ),
    )

    expect(added).toHaveBeenCalledTimes(50)
    expect(listeners(controller.signal)).toHaveLength(0)
  })

  it('still binds a promise that never settles, until it does', async () => {
    const controller = new AbortController()
    const ap = new AbortablePromise<string>(() => {}).abortOn(controller.signal)

    controller.abort()

    await expect(ap).rejects.toSatisfy(isAbortError)
  })
})

describe('AbortablePromise abort context', () => {
  /**
   * Counts the AbortControllers built while `build` runs and for ten microtask
   * turns after it, and returns what `build` returned.
   */
  async function countingControllers<T>(build: () => T) {
    const Real = globalThis.AbortController
    let built = 0
    class Counting extends Real {
      constructor() {
        super()
        built++
      }
    }
    globalThis.AbortController = Counting
    let result: T
    try {
      result = build()
      for (let turn = 0; turn < 10; turn++) {
        await Promise.resolve()
      }
    } finally {
      globalThis.AbortController = Real
    }
    return { built, result }
  }

  it('allocates no AbortController for a chain that never reads the signal', async () => {
    const { built, result } = await countingControllers(() =>
      AbortablePromise.resolve('x')
        .then((v) => `${v}y`)
        .then((v) => `${v}z`),
    )

    await result
    expect(built).toBe(0)
  })

  it('allocates one the first time the executor reads the signal, and reuses it', async () => {
    let first: AbortSignal | undefined
    let second: AbortSignal | undefined

    const { built, result } = await countingControllers(
      () =>
        new AbortablePromise<string>((resolve, _reject, context) => {
          first = context.signal
          second = context.signal
          resolve('done')
        }),
    )

    await result
    expect(built).toBe(1)
    expect(first).toBeInstanceOf(AbortSignal)
    expect(first).toBe(second)
  })

  it('hands a signal that is already aborted to an executor that reads it after the abort', async () => {
    let context: { readonly signal: AbortSignal } | undefined
    const ap = new AbortablePromise<string>((_resolve, _reject, ctx) => {
      context = ctx
    })

    ap.abort()

    expect(context?.signal.aborted).toBe(true)
    await expect(ap).rejects.toSatisfy(isAbortError)
  })

  it('aborts correctly even though no controller was ever created', async () => {
    const { built, result } = await countingControllers(() => {
      const ap = new AbortablePromise<string>(() => {})
      ap.abort()
      return ap
    })

    await expect(result).rejects.toSatisfy(isAbortError)
    expect(built).toBe(0)
  })

  it('propagates upstream without a controller on either promise', async () => {
    const { built, result } = await countingControllers(() => {
      const source = new AbortablePromise<string>(() => {})
      const derived = source.then((v) => v)

      derived.abort()

      return { source, derived }
    })

    await expect(result.derived).rejects.toSatisfy(isAbortError)
    await expect(result.source).rejects.toSatisfy(isAbortError)
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

describe('AbortablePromise unhandled rejections', () => {
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

  it('leaves none behind when a delegate is aborted', async () => {
    // The adoption is started before the link to the delegate is registered,
    // so the rejection the propagation causes is already accounted for.
    const unhandled = await unhandledDuring(() => {
      const work = new AbortablePromise<string>(() => {})
      const ap = new AbortablePromise<string>((resolve) => resolve(work))
      ap.abort()
      void ap.catch(() => {})
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

describe('AbortablePromise resolve functions, as a native promise has them', () => {
  /* A promise that fulfils with `value` after `ms`. */
  const later = <T>(value: T, ms = 5) =>
    new Promise<T>((resolve) => setTimeout(() => resolve(value), ms))

  const outcome = async (promise: Promise<unknown>) => {
    try {
      return { fulfilled: await promise }
    } catch (error) {
      return { rejected: error }
    }
  }

  const executors: Record<
    string,
    (
      resolve: (value: unknown) => void,
      reject: (reason?: unknown) => void,
    ) => void
  > = {
    'a resolve with a plain value after resolve(thenable)': (resolve) => {
      resolve(later('slow'))
      resolve('fast')
    },
    'a reject after resolve(thenable)': (resolve, reject) => {
      resolve(later('slow'))
      reject(new Error('late'))
    },
    'a resolve with a thenable after resolve(thenable)': (resolve) => {
      resolve(later('slow', 10))
      resolve(later('other', 1))
    },
    'a throw after resolve(thenable)': (resolve) => {
      resolve(later('slow'))
      throw new Error('late')
    },
    'a resolve with a revoked Proxy in a try block after resolve(thenable)': (
      resolve,
    ) => {
      resolve(later('slow'))
      const revoked = Proxy.revocable({}, {})
      revoked.revoke()
      try {
        resolve(revoked.proxy)
      } catch {
        // Native returns normally; so must this.
      }
    },
  }

  it.each(Object.entries(executors))(
    'ignores %s, as Promise does',
    async (_name, executor) => {
      const native = await outcome(new Promise(executor))
      const ours = await outcome(new AbortablePromise(executor))

      expect(native).toEqual({ fulfilled: 'slow' })
      expect(ours).toEqual(native)
    },
  )

  it.each([
    ['a delegate', (work: AbortablePromise<string>) => work],
    ['a plain value', () => 'plain'],
  ])(
    'hands over only the first of two resolves called after the abort, when it is %s',
    async (_, first) => {
      let resolveLate!: (value: string | PromiseLike<string>) => void
      const outer = new AbortablePromise<string>((resolve) => {
        resolveLate = resolve
      })
      const work = new AbortablePromise<string>(() => {})
      const other = new AbortablePromise<string>(() => {})
      const settledOf = (promise: object) => {
        const settled: string[] = []
        void Promise.prototype.then.call(
          promise,
          () => settled.push('fulfilled'),
          () => settled.push('rejected'),
        )
        return settled
      }
      const workSettled = settledOf(work)
      const otherSettled = settledOf(other)
      void outer.catch(() => {})

      outer.abort()
      resolveLate(first(work))
      resolveLate(other)
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(workSettled).toEqual(first(work) === work ? ['rejected'] : [])
      expect(otherSettled).toEqual([])
    },
  )

  it('stays abortable, and aborts its delegate, after a later resolve was ignored', async () => {
    const work = new AbortablePromise<string>(() => {})
    const ap = new AbortablePromise<string>((resolve) => {
      resolve(work)
      resolve('fast')
    })

    ap.abort()

    await expect(ap).rejects.toSatisfy(isAbortError)
    await expect(work).rejects.toSatisfy(isAbortError)
  })

  it('stays abortable, and aborts its delegate, after a revoked Proxy was resolved with in a try block', async () => {
    const work = new AbortablePromise<string>(() => {})
    const ap = new AbortablePromise<string>((resolve) => {
      resolve(work)
      const revoked = Proxy.revocable({}, {})
      revoked.revoke()
      try {
        resolve(revoked.proxy as never)
      } catch {
        // Not reached.
      }
    })

    ap.abort()

    await expect(ap).rejects.toSatisfy(isAbortError)
    await expect(work).rejects.toSatisfy(isAbortError)
  })

  it('follows the delegate when the executor throws after resolving with it, as Promise does', async () => {
    let finish!: (value: string) => void
    const work = new Promise<string>((resolve) => {
      finish = resolve
    })
    const ap = new AbortablePromise<string>((resolve) => {
      resolve(work)
      throw new Error('late')
    })

    finish('work finished')

    await expect(ap).resolves.toEqual('work finished')
  })

  it('stays abortable, and aborts its delegate, when the executor throws after resolving with it', async () => {
    const work = new AbortablePromise<string>(() => {})
    const controller = new AbortController()
    const ap = new AbortablePromise<string>((resolve) => {
      resolve(work)
      throw new Error('late')
    }).abortOn(controller.signal)

    controller.abort()

    await expect(ap).rejects.toSatisfy(isAbortError)
    await expect(work).rejects.toSatisfy(isAbortError)
  })

  it('is settled by an executor that throws: aborting it no longer reaches anything', async () => {
    const controller = new AbortController()
    const ap = new AbortablePromise<string>(() => {
      throw new RangeError('thrown')
    }, controller)

    await expect(ap).rejects.toBeInstanceOf(RangeError)
    expect(listeners(controller.signal)).toHaveLength(0)
    ap.abort()
    expect(controller.signal.aborted).toBe(false)
  })

  it('rejects with a TypeError when resolved with itself, as Promise does', async () => {
    let resolveNative!: (value: unknown) => void
    const native = new Promise((resolve) => {
      resolveNative = resolve
    })
    resolveNative(native)

    let resolveOurs!: (value: unknown) => void
    const ours = new AbortablePromise((resolve) => {
      resolveOurs = resolve
    })
    resolveOurs(ours)

    await expect(native).rejects.toBeInstanceOf(TypeError)
    await expect(ours).rejects.toBeInstanceOf(TypeError)
  })

  it('is settled by rejecting for resolving with itself: a later abort leaves its controller alone', async () => {
    const controller = new AbortController()
    let resolveOurs!: (value: unknown) => void
    const ours = new AbortablePromise((resolve) => {
      resolveOurs = resolve
    }, controller)
    resolveOurs(ours)

    await expect(ours).rejects.toBeInstanceOf(TypeError)
    expect(listeners(controller.signal)).toHaveLength(0)
    ours.abort()
    expect(controller.signal.aborted).toBe(false)
  })

  it('rejects with a TypeError when a thenable it was resolved with resolves it with itself, as Promise does', async () => {
    const resolveWithItself = (
      resolve: (value: unknown) => void,
      self: () => unknown,
    ) => {
      resolve({
        then(onFulfilled: (value: unknown) => void) {
          onFulfilled(self())
        },
      })
    }
    const native: Promise<unknown> = new Promise((resolve) => {
      resolveWithItself(resolve, () => native)
    })
    const ours: AbortablePromise<unknown> = new AbortablePromise((resolve) => {
      resolveWithItself(resolve, () => ours)
    })

    await expect(native).rejects.toBeInstanceOf(TypeError)
    await expect(ours).rejects.toBeInstanceOf(TypeError)
  })

  it('rejects with a TypeError when a derived promise is resolved with itself, as Promise does', async () => {
    const native: Promise<unknown> = Promise.resolve(1).then(() => native)
    const ours: AbortablePromise<unknown> = AbortablePromise.resolve(1).then(
      () => ours,
    )

    await expect(native).rejects.toBeInstanceOf(TypeError)
    await expect(ours).rejects.toBeInstanceOf(TypeError)
  })

  it('does not follow a thenable passed to a later resolve: aborting aborts the first delegate only', async () => {
    const first = new AbortablePromise<string>(() => {})
    let finishSecond!: (value: string) => void
    const second = new AbortablePromise<string>((resolve) => {
      finishSecond = resolve
    })
    const ap = new AbortablePromise<string>((resolve) => {
      resolve(first)
      resolve(second)
    })

    ap.abort()
    finishSecond('second finished')

    await expect(ap).rejects.toSatisfy(isAbortError)
    await expect(first).rejects.toSatisfy(isAbortError)
    await expect(second).resolves.toEqual('second finished')
  })

  it('leaves the rejection of a thenable passed to a later resolve unhandled, as Promise does', async () => {
    const rejection = new RangeError('late')
    const run = (construct: typeof Promise | typeof AbortablePromise) => {
      let ap: Promise<unknown> | undefined
      return unhandledDuring(() => {
        ap = new construct<unknown>((resolve) => {
          resolve(later('slow'))
          resolve(Promise.reject(rejection))
        })
      }).then(async (unhandled) => ({ unhandled, outcome: await ap }))
    }

    const native = await run(Promise)
    const ours = await run(AbortablePromise)

    expect(native).toEqual({ unhandled: [rejection], outcome: 'slow' })
    expect(ours).toEqual(native)
  })

  it.each([
    [
      'reject',
      (
        _resolve: (value: unknown) => void,
        reject: (reason: unknown) => void,
      ) => {
        reject(new Error('first'))
      },
    ],
    [
      'resolve with a plain value',
      (resolve: (value: unknown) => void) => {
        resolve('first')
      },
    ],
  ])(
    'leaves the rejection of a thenable passed to resolve after %s unhandled, as Promise does',
    async (_name, first) => {
      const rejection = new RangeError('late')
      const run = (construct: typeof Promise | typeof AbortablePromise) => {
        let ap: Promise<unknown> | undefined
        return unhandledDuring(() => {
          ap = new construct<unknown>((resolve, reject) => {
            first(resolve, reject)
            resolve(Promise.reject(rejection))
          })
          void ap.catch(() => {})
        })
      }

      expect(await run(AbortablePromise)).toEqual(await run(Promise))
      expect(await run(AbortablePromise)).toEqual([rejection])
    },
  )

  it('is settled by a peer executor that throws: aborting the peer leaves the signal it shares alone', async () => {
    let signal!: AbortSignal
    const source = new AbortablePromise<string>(
      (_resolve, _reject, context) => {
        signal = context.signal
      },
    )
    const peer = source.peer(() => {
      throw new RangeError('thrown')
    })
    await expect(peer).rejects.toBeInstanceOf(RangeError)

    peer.abort()

    expect(signal.aborted).toBe(false)
    void source.catch(() => {})
    source.abort()
  })

  it('is settled by an executor that throws: a cleanup on its own signal does not run when it is aborted', async () => {
    const cleanup = vi.fn()
    const ap = new AbortablePromise<string>((_resolve, _reject, context) => {
      context.signal.addEventListener('abort', cleanup)
      throw new RangeError('thrown')
    })
    await expect(ap).rejects.toBeInstanceOf(RangeError)

    ap.abort()

    expect(cleanup).not.toHaveBeenCalled()
  })
})

describe('AbortablePromise with a then getter that changes between reads', () => {
  it('follows a second then read with its abort window closed', async () => {
    let reads = 0
    const value = {
      get then() {
        return ++reads === 1
          ? undefined
          : (res: (v: string) => void) => res('second')
      },
    }
    const controller = new AbortController()
    const promise = new AbortablePromise(
      (resolve) => resolve(value),
      controller,
    )
    promise.abort()
    await expect(promise).resolves.toBe('second')
    expect(reads).toBe(2)
    expect(controller.signal.aborted).toBe(false)
    expect(listeners(controller.signal)).toEqual([])
  })

  it.each(['direct', 'plain thenable', 'native promise'] as const)(
    'stays pending after both aborts through %s resolution',
    async (path) => {
      let reads = 0
      const followed = vi.fn()
      const value = {
        get then() {
          return ++reads === 1 ? undefined : followed
        },
      }
      const controller = new AbortController()
      const promise = new AbortablePromise((resolve) => {
        if (path === 'direct') resolve(value)
        else if (path === 'native promise') resolve(Promise.resolve(value))
        else
          resolve({
            then: (fulfil: (v: unknown) => void) => fulfil(value),
          })
      }, controller)
      const outcome = () =>
        Promise.race([
          promise.then(
            () => 'fulfilled',
            () => 'rejected',
          ),
          new Promise((resolve) => setTimeout(() => resolve('pending'), 0)),
        ])
      await new Promise((resolve) => setTimeout(resolve, 0))
      promise.abort()
      expect(await outcome()).toBe('pending')
      expect(reads).toBe(2)
      expect(followed).toHaveBeenCalledTimes(1)
      expect(controller.signal.aborted).toBe(false)
      expect(listeners(controller.signal)).toEqual([])
      controller.abort()
      expect(await outcome()).toBe('pending')
      expect(followed).toHaveBeenCalledTimes(1)
    },
  )

  it.each(['adoption', 'handler'] as const)(
    'pins pending second reads through %s against native promises',
    async (path) => {
      const makeValue = () => {
        let reads = 0
        const followed = vi.fn()
        return {
          value: {
            get then() {
              return ++reads === 1 ? undefined : followed
            },
          },
          reads: () => reads,
          followed,
        }
      }
      const actual = makeValue()
      const native = makeValue()
      const controller = new AbortController()
      const promise =
        path === 'adoption'
          ? new AbortablePromise((resolve) => {
              resolve(new AbortablePromise((r) => r(actual.value)))
            }, controller)
          : AbortablePromise.resolve().then(() => actual.value)
      const reference =
        path === 'adoption'
          ? new Promise((resolve) => {
              resolve(new AbortablePromise((r) => r(native.value)))
            })
          : Promise.resolve().then(() => native.value)
      const pending = (value: Promise<unknown>) =>
        Promise.race([
          value.then(
            () => 'fulfilled',
            () => 'rejected',
          ),
          new Promise((resolve) => setTimeout(() => resolve('pending'), 0)),
        ])
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(await pending(promise)).toBe('pending')
      promise.abort()
      if (path === 'adoption') {
        await expect(promise).rejects.toSatisfy(isAbortError)
        expect(controller.signal.aborted).toBe(true)
        expect(await pending(reference)).toBe('pending')
      } else {
        expect(await pending(promise)).toBe('pending')
        await expect(reference).resolves.toBe(native.value)
      }
      expect(actual.reads()).toBe(2)
      expect(actual.followed).toHaveBeenCalledTimes(1)
      expect(native.reads()).toBe(path === 'adoption' ? 2 : 1)
      expect(native.followed).toHaveBeenCalledTimes(path === 'adoption' ? 1 : 0)
    },
  )

  it('rejects when a second then read throws', async () => {
    let reads = 0
    const error = new Error('second read')
    const value = {
      get then(): undefined {
        if (++reads === 1) return undefined
        throw error
      },
    }
    const controller = new AbortController()
    const promise = new AbortablePromise(
      (resolve) => resolve(value),
      controller,
    )
    promise.abort()
    await expect(promise).rejects.toBe(error)
    expect(reads).toBe(2)
    expect(controller.signal.aborted).toBe(false)
    expect(listeners(controller.signal)).toEqual([])
  })
})

describe('AbortablePromise combinators, as the native ones are called', () => {
  const calls = {
    all: (values: unknown) =>
      AbortablePromise.all(values as Iterable<unknown>) as Promise<unknown>,
    race: (values: unknown) =>
      AbortablePromise.race(values as Iterable<unknown>) as Promise<unknown>,
    any: (values: unknown) =>
      AbortablePromise.any(values as Iterable<unknown>) as Promise<unknown>,
    allSettled: (values: unknown) =>
      AbortablePromise.allSettled(
        values as Iterable<unknown>,
      ) as Promise<unknown>,
  }
  const natives = {
    all: (values: unknown) => Promise.all(values as Iterable<unknown>),
    race: (values: unknown) => Promise.race(values as Iterable<unknown>),
    any: (values: unknown) => Promise.any(values as Iterable<unknown>),
    allSettled: (values: unknown) =>
      Promise.allSettled(values as Iterable<unknown>),
  }
  const names = Object.keys(calls) as (keyof typeof calls)[]
  // eslint-disable-next-line @typescript-eslint/unbound-method -- only returned
  const abortableThen = AbortablePromise.prototype.then
  // eslint-disable-next-line @typescript-eslint/unbound-method -- only returned
  const nativeThen = Promise.prototype.then

  describe.each(names)('%s', (name) => {
    it('throws a TypeError for a receiver that is not an AbortablePromise', () => {
      // eslint-disable-next-line @typescript-eslint/unbound-method -- called with `call`
      const combinator = AbortablePromise[name] as unknown as (
        this: unknown,
        values: unknown,
      ) => unknown

      expect(() => combinator.call(Promise, [1])).toThrow(TypeError)
    })

    it.each([null, undefined, 5, {}])(
      'returns a rejected AbortablePromise, as Promise does, for the non-iterable %j',
      async (values) => {
        await expect(natives[name](values)).rejects.toBeInstanceOf(TypeError)

        let combined: Promise<unknown> | undefined
        expect(() => {
          combined = calls[name](values)
        }).not.toThrow()
        expect(combined).toBeInstanceOf(AbortablePromise)
        await expect(combined).rejects.toBeInstanceOf(TypeError)
      },
    )

    it('rejects with what the iterator throws, as Promise does', async () => {
      const iterable = {
        [Symbol.iterator]() {
          throw new RangeError('no iterator')
        },
      }
      await expect(natives[name](iterable)).rejects.toBeInstanceOf(RangeError)

      await expect(calls[name](iterable)).rejects.toBeInstanceOf(RangeError)
    })

    it('reads the then of a member that is an AbortablePromise once, as Promise reads it', async () => {
      const readsOf = (member: Promise<unknown>, then: unknown) => {
        let reads = 0
        void Object.defineProperty(member, 'then', {
          get() {
            reads++
            return then
          },
        })
        return () => reads
      }

      const native = Promise.resolve('a')
      const nativeReads = readsOf(native, nativeThen)
      await natives[name]([native])

      const ours = AbortablePromise.resolve('a')
      const oursReads = readsOf(ours, abortableThen)
      await calls[name]([ours])

      expect(nativeReads()).toBe(1)
      expect(oursReads()).toBe(1)
    })

    it('aborts the member it subscribed to, when the then getter throws on a later read', async () => {
      const member = new AbortablePromise<string>(() => {})
      let reads = 0
      void Object.defineProperty(member, 'then', {
        get() {
          reads++
          if (reads > 1) {
            throw new RangeError('later read')
          }
          return abortableThen
        },
      })

      const combined = calls[name]([member]) as AbortablePromise<unknown>
      void combined.catch(() => {})
      combined.abort()

      await expect(combined).rejects.toSatisfy(isAbortError)
      // Read through the prototype: the member's own `then` getter throws.
      const outcome = Promise.prototype.then.call(
        member,
        () => 'fulfilled',
        (error: unknown) => error,
      )
      await expect(outcome).resolves.toSatisfy(isAbortError)
    })

    it('does not abort a member it never subscribed to, when the then getter throws only on its first read', async () => {
      const unhandled = await unhandledDuring(() => {
        const member = new AbortablePromise<string>(() => {})
        let reads = 0
        void Object.defineProperty(member, 'then', {
          get() {
            reads++
            if (reads === 1) {
              throw new RangeError('first read')
            }
            return abortableThen
          },
        })
        const abort = vi.spyOn(member, 'abort')

        const combined = calls[name]([member]) as AbortablePromise<unknown>
        void combined.catch(() => {})
        combined.abort()

        expect(abort).not.toHaveBeenCalled()
      })

      expect(unhandled).toEqual([])
    })

    it('rejects, or is rejected by, the error a then getter throws on its first read, as Promise does', async () => {
      const readThrowing = (
        member: Promise<unknown>,
        abortableThen: unknown,
      ) => {
        let reads = 0
        void Object.defineProperty(member, 'then', {
          get() {
            reads++
            if (reads === 1) {
              throw new RangeError('first read')
            }
            return abortableThen
          },
        })
      }
      const settled = async (combined: Promise<unknown>) => {
        try {
          return { fulfilled: await combined }
        } catch (error) {
          return { rejected: error }
        }
      }
      const reasonsOf = (outcome: {
        fulfilled?: unknown
        rejected?: unknown
      }): string[] => {
        const messageOf = (reason: unknown) => (reason as Error).message
        if ('fulfilled' in outcome) {
          return (outcome.fulfilled as { reason: unknown }[]).map((result) =>
            messageOf(result.reason),
          )
        }
        return outcome.rejected instanceof AggregateError
          ? (outcome.rejected.errors as unknown[]).map(messageOf)
          : [messageOf(outcome.rejected)]
      }

      const native = Promise.resolve('a')
      readThrowing(native, nativeThen)
      const ours = AbortablePromise.resolve('a')
      readThrowing(ours, abortableThen)

      const nativeOutcome = await settled(natives[name]([native]))
      const ourOutcome = await settled(calls[name]([ours]))

      // `any` rejects with an AggregateError of the reasons, `allSettled`
      // fulfils: each as it does for a member that rejects.
      expect(reasonsOf(ourOutcome)).toEqual(reasonsOf(nativeOutcome))
      expect(reasonsOf(ourOutcome)).toEqual(['first read'])
    })

    it('leaves a member alone when its then is not a function on the first read, and the combinator reads it again', async () => {
      const member = new AbortablePromise<string>(() => {})
      let reads = 0
      void Object.defineProperty(member, 'then', {
        get() {
          reads++
          return reads === 1 ? undefined : abortableThen
        },
      })
      const abort = vi.spyOn(member, 'abort')

      const combined = calls[name]([member]) as AbortablePromise<unknown>
      void combined.catch(() => {})
      combined.abort()

      await expect(combined).rejects.toSatisfy(isAbortError)
      // Subscribed to by the second read, and not aborted.
      expect(reads).toBe(2)
      expect(abort).not.toHaveBeenCalled()
      void member.catch(() => {})
      member.abort()
    })

    it('iterates lazily, as Promise does: a member before a throwing iterator is subscribed to', async () => {
      const iterable = (rejected: Promise<unknown>) => ({
        [Symbol.iterator]() {
          let step = 0
          return {
            next(): IteratorResult<unknown> {
              if (step++ === 0) {
                return { value: rejected, done: false }
              }
              throw new RangeError('iterator')
            },
          }
        },
      })

      const nativeUnhandled = await unhandledDuring(() => {
        void natives[name](iterable(Promise.reject(new Error('r')))).catch(
          () => {},
        )
      })
      const ourUnhandled = await unhandledDuring(() => {
        void calls[name](iterable(Promise.reject(new Error('r')))).catch(
          () => {},
        )
      })

      expect(nativeUnhandled).toEqual([])
      expect(ourUnhandled).toEqual([])
    })

    it('closes the iterator when the combinator stops early, as Promise does', async () => {
      const closed = vi.fn()
      const iterable = {
        [Symbol.iterator]() {
          let step = 0
          return {
            next(): IteratorResult<unknown> {
              return step++ < 3
                ? { value: 1, done: false }
                : { value: undefined, done: true }
            },
            return(): IteratorResult<unknown> {
              closed()
              return { value: undefined, done: true }
            },
          }
        },
      }
      class Failing<T> extends AbortablePromise<T> {
        static override resolve(): never {
          throw new RangeError('resolve')
        }
      }
      class NativeFailing<T> extends Promise<T> {
        static override resolve(): never {
          throw new RangeError('resolve')
        }
      }
      const run = (construct: unknown) =>
        (construct as Record<string, (values: unknown) => Promise<unknown>>)[
          name
        ].call(construct, iterable)

      await expect(run(NativeFailing)).rejects.toBeInstanceOf(RangeError)
      const afterNative = closed.mock.calls.length
      await expect(run(Failing)).rejects.toBeInstanceOf(RangeError)

      expect(afterNative).toBe(1)
      expect(closed.mock.calls.length).toBe(2)
    })

    it('hands a subclass’s resolve a thenable for a member that is an AbortablePromise, not the member', async () => {
      class Sub<T> extends AbortablePromise<T> {}
      const resolveSpy = vi.spyOn(Sub, 'resolve')
      const member = AbortablePromise.resolve('a')

      await (
        Sub as unknown as Record<string, (v: unknown) => Promise<unknown>>
      )[name].call(Sub, [member])

      expect(resolveSpy).toHaveBeenCalledTimes(1)
      expect(resolveSpy.mock.calls[0]?.[0]).not.toBe(member)
    })
  })
})

describe('AbortablePromise with a controller whose abort() throws', () => {
  class Throwing extends AbortController {
    override abort(): void {
      throw new RangeError('refused')
    }
  }

  it('is rejected, aborts its delegate and releases its listeners, and abort() throws the error', async () => {
    const controller = new Throwing()
    const work = new AbortablePromise<string>(() => {})
    const ap = new AbortablePromise<string>(
      (resolve) => resolve(work),
      controller,
    )

    expect(() => ap.abort()).toThrow(RangeError)

    await expect(ap).rejects.toSatisfy(isAbortError)
    await expect(work).rejects.toSatisfy(isAbortError)
    expect(listeners(controller.signal)).toHaveLength(0)
    // Aborted once: a second call neither throws nor does anything.
    expect(() => ap.abort()).not.toThrow()
  })

  it('throws the controller’s error before a later link’s, after calling every link', async () => {
    const controller = new Throwing()
    const first = new AbortablePromise<string>(() => {})
    const ap = new AbortablePromise<string>(
      (resolve) => resolve(first),
      controller,
    )
    const abortFirst = vi.fn(() => {
      throw new TypeError('later')
    })
    first.abort = abortFirst

    expect(() => ap.abort()).toThrow(RangeError)
    await expect(ap).rejects.toSatisfy(isAbortError)
    expect(abortFirst).toHaveBeenCalledTimes(1)
  })

  describe('that has aborted already', () => {
    class ThrowingAfterAbort extends AbortController {
      override abort(): void {
        super.abort()
        throw new RangeError('refused')
      }
    }

    it('is not asked to abort again when it is already aborted as it is passed in', async () => {
      const controller = new ThrowingAfterAbort()
      expect(() => controller.abort()).toThrow(RangeError)
      const abort = vi.spyOn(controller, 'abort')

      let ap: AbortablePromise<string> | undefined
      expect(() => {
        ap = new AbortablePromise<string>(() => {}, controller)
      }).not.toThrow()

      await expect(ap).rejects.toSatisfy(isAbortError)
      expect(abort).not.toHaveBeenCalled()
    })

    it('is not asked to abort again when another holder aborted it', async () => {
      const controller = new ThrowingAfterAbort()
      const ap = new AbortablePromise<string>(() => {}, controller)
      const abort = vi.spyOn(controller, 'abort')

      expect(() => controller.abort()).toThrow(RangeError)

      await expect(ap).rejects.toSatisfy(isAbortError)
      expect(abort).toHaveBeenCalledTimes(1)
    })
  })
})

describe('AbortablePromise.abort order', () => {
  it('fires the signal before rejecting, so a listener’s microtask runs ahead of the rejection’s handlers', async () => {
    const order: string[] = []
    const ap = new AbortablePromise<string>((_resolve, _reject, context) => {
      context.signal.addEventListener('abort', () => {
        queueMicrotask(() => order.push('listener'))
      })
    })
    const handled = ap.catch(() => order.push('rejection'))

    ap.abort()
    await handled

    expect(order).toEqual(['listener', 'rejection'])
  })
})

describe('AbortablePromise fan-in aborted while it is being made', () => {
  /* A subclass whose latest instance is exposed, for a `values` generator that
     aborts the combined promise while it is iterated. */
  function exposingSubclass() {
    const exposed: { combined?: AbortablePromise<unknown> } = {}
    class Exposing<T> extends AbortablePromise<T> {
      constructor(
        executor: ConstructorParameters<typeof AbortablePromise<T>>[0],
        controller?: AbortController,
      ) {
        super(executor, controller)
        exposed.combined = this
      }
    }
    return { Exposing, exposed }
  }

  /* A subclass whose constructor aborts the first instance made, which is the
     combined promise: the combinator constructs it first. */
  function abortingSubclass() {
    let made = 0
    class Aborting<T> extends AbortablePromise<T> {
      constructor(
        executor: ConstructorParameters<typeof AbortablePromise<T>>[0],
        controller?: AbortController,
      ) {
        super(executor, controller)
        if (made++ === 0) {
          this.abort()
        }
      }
    }
    return Aborting
  }

  it('aborts an ordinary member when the combined promise was aborted while its values were iterated', async () => {
    const { Exposing, exposed } = exposingSubclass()
    const member = new AbortablePromise<string>(() => {})
    function* values() {
      yield member
      exposed.combined?.abort()
    }

    const result = Exposing.all(values())

    await expect(result).rejects.toSatisfy(isAbortError)
    await expect(member).rejects.toSatisfy(isAbortError)
  })

  it('aborts every member of a combined promise aborted while its values were iterated, including those taken after the abort', async () => {
    const { Exposing, exposed } = exposingSubclass()
    const before = new AbortablePromise<string>(() => {})
    const after = new AbortablePromise<string>(() => {})
    const afterThat = new AbortablePromise<string>(() => {})
    function* values() {
      yield before
      exposed.combined?.abort()
      yield after
      yield afterThat
    }

    const result = Exposing.all(values())

    await expect(result).rejects.toSatisfy(isAbortError)
    await expect(before).rejects.toSatisfy(isAbortError)
    await expect(after).rejects.toSatisfy(isAbortError)
    await expect(afterThat).rejects.toSatisfy(isAbortError)
  })

  it('aborts every member of a combined promise aborted by a subclass constructor', async () => {
    const members = [
      new AbortablePromise<string>(() => {}),
      new AbortablePromise<string>(() => {}),
    ]

    const result = abortingSubclass().all(members)

    await expect(result).rejects.toSatisfy(isAbortError)
    for (const member of members) {
      await expect(member).rejects.toSatisfy(isAbortError)
    }
  })

  it('returns a combined promise aborted by a subclass constructor, without throwing, when a member’s abort() throws', async () => {
    const member = new AbortablePromise<string>(() => {})
    member.abort = () => {
      throw new RangeError('refused')
    }
    void member.catch(() => {})

    let result: Promise<unknown> | undefined
    expect(() => {
      result = abortingSubclass().all([member])
    }).not.toThrow()

    await expect(result).rejects.toSatisfy(isAbortError)
  })

  it('returns the combined promise, aborted, when a member’s abort() throws for the link that fires at once', async () => {
    const { Exposing, exposed } = exposingSubclass()
    const member = new AbortablePromise<string>(() => {})
    member.abort = () => {
      throw new RangeError('refused')
    }
    void member.catch(() => {})
    function* values() {
      yield member
      exposed.combined?.abort()
    }

    let result: Promise<unknown> | undefined
    expect(() => {
      result = Exposing.all(values())
    }).not.toThrow()

    await expect(result).rejects.toSatisfy(isAbortError)
  })
})

describe('AbortablePromise with an Object.prototype that has a promise property', () => {
  it('does not take the inherited property for the promise it belongs to', async () => {
    Object.defineProperty(Object.prototype, 'promise', {
      value: true,
      configurable: true,
      writable: true,
    })
    let ap: AbortablePromise<boolean> | undefined
    try {
      ap = new AbortablePromise<boolean>((resolve) => resolve(true))
    } finally {
      delete (Object.prototype as { promise?: unknown }).promise
    }

    await expect(ap).resolves.toBe(true)
  })

  it('does not call an inherited setter for it', async () => {
    const setter = vi.fn()
    Object.defineProperty(Object.prototype, 'promise', {
      set: setter,
      configurable: true,
    })
    let ap: AbortablePromise<boolean> | undefined
    try {
      ap = new AbortablePromise<boolean>((resolve) => resolve(true))
    } finally {
      delete (Object.prototype as { promise?: unknown }).promise
    }

    expect(await ap).toBe(true)
    expect(setter).not.toHaveBeenCalled()
  })
})

describe('AbortablePromise with an Object.create replaced after the module loaded', () => {
  it('is made without calling it', async () => {
    const original = Object.create
    const replacement = vi.fn(() => {
      throw new RangeError('replaced')
    })
    let ap: AbortablePromise<boolean> | undefined
    Object.create = replacement
    try {
      ap = new AbortablePromise<boolean>((resolve) => resolve(true))
    } finally {
      Object.create = original
    }

    expect(await ap).toBe(true)
    expect(replacement).not.toHaveBeenCalled()
  })
})

describe('AbortablePromise with a controller whose signal getter throws', () => {
  it('is rejected with the getter’s error and settled: abortOn adds no listener', async () => {
    const error = new Error('signal')
    class Bad extends AbortController {
      override get signal(): AbortSignal {
        throw error
      }
    }
    const controller = new Bad()
    const promise = new AbortablePromise(() => {}, controller)
    await expect(promise).rejects.toBe(error)
    const other = new AbortController()
    void promise.abortOn(other.signal)
    expect(listeners(other.signal)).toHaveLength(0)
    promise.abort()
  })

  it('does not abort the controller after its signal getter throws once', async () => {
    const error = new Error('signal')
    let reads = 0
    class Bad extends AbortController {
      override get signal(): AbortSignal {
        if (reads++ === 0) throw error
        return super.signal
      }
    }
    const controller = new Bad()
    const promise = new AbortablePromise(() => {}, controller)
    await expect(promise).rejects.toBe(error)
    promise.abort()
    expect(controller.signal.aborted).toBe(false)
  })
})

describe('AbortablePromise with a controller whose addEventListener throws', () => {
  it('is rejected and settled: abortOn adds no listener and abort leaves the controller alone', async () => {
    const error = new Error('listener')
    const controller = new AbortController()
    controller.signal.addEventListener = () => {
      throw error
    }
    const promise = new AbortablePromise(() => {}, controller)
    await expect(promise).rejects.toBe(error)
    const other = new AbortController()
    void promise.abortOn(other.signal)
    expect(listeners(other.signal)).toHaveLength(0)
    promise.abort()
    expect(controller.signal.aborted).toBe(false)
  })
})

describe('AbortablePromise with listener options on Object.prototype', () => {
  it.each(['capture', 'signal'])(
    'ignores inherited %s listener options',
    async (key) => {
      const controller = new AbortController()
      let resolve!: (value: number) => void
      const promise = new AbortablePromise<number>((done) => {
        resolve = done
      })
      const previous = Object.getOwnPropertyDescriptor(Object.prototype, key)
      try {
        Object.defineProperty(Object.prototype, key, {
          configurable: true,
          value: key === 'capture' ? true : AbortSignal.abort(),
        })
        void promise.abortOn(controller.signal)
      } finally {
        if (previous) Object.defineProperty(Object.prototype, key, previous)
        else Reflect.deleteProperty(Object.prototype, key)
      }
      expect(listeners(controller.signal)).toHaveLength(1)
      resolve(1)
      await expect(promise).resolves.toBe(1)
      expect(listeners(controller.signal)).toHaveLength(0)
    },
  )
})

describe('AbortablePromise with an Array.prototype.push that throws', () => {
  it('does not attach a listener if recording its release throws', () => {
    const promise = new AbortablePromise(() => {})
    const controller = new AbortController()
    const error = new Error('push')
    const push = Object.getOwnPropertyDescriptor(Array.prototype, 'push')!
    Object.defineProperty(Array.prototype, 'push', {
      ...push,
      value() {
        throw error
      },
    })
    try {
      expect(() => promise.abortOn(controller.signal)).toThrow(error)
    } finally {
      Object.defineProperty(Array.prototype, 'push', push)
    }
    expect(listeners(controller.signal)).toHaveLength(0)
  })
})

describe('AbortablePromise throwing releases', () => {
  it.each(['resolve', 'reject', 'abort'] as const)(
    'settles and attempts every release on %s',
    async (path) => {
      const first = new AbortController()
      const second = new AbortController()
      const error = new Error('release')
      const reason = new Error('reason')
      let resolve!: (value: number) => void
      let reject!: (reason: unknown) => void
      const promise = new AbortablePromise<number>((yes, no) => {
        resolve = yes
        reject = no
      })
      void promise.abortOn(first.signal).abortOn(second.signal)
      const outcome = promise.then(
        (value) => value,
        (caught: unknown) => caught,
      )
      const remove = first.signal.removeEventListener.bind(first.signal)
      let calls = 0
      first.signal.removeEventListener = (
        ...args: Parameters<AbortSignal['removeEventListener']>
      ) => {
        calls++
        remove(...args)
        throw error
      }
      const settle = () => {
        if (path === 'resolve') resolve(1)
        else if (path === 'reject') reject(reason)
        else promise.abort()
      }
      expect(settle).toThrow(error)
      const result = await Promise.race([
        outcome,
        new Promise((r) => setTimeout(() => r('pending'), 0)),
      ])
      if (path === 'resolve') expect(result).toBe(1)
      else if (path === 'reject') expect(result).toBe(reason)
      else expect(isAbortError(result)).toBe(true)
      expect(listeners(first.signal)).toHaveLength(0)
      expect(listeners(second.signal)).toHaveLength(0)
      promise.abort()
      resolve(2)
      reject(reason)
      expect(calls).toBe(1)
    },
  )
})

describe('AbortablePromise settlement releases', () => {
  it.each([
    'native',
    'follow',
    'abortable',
    'thenable',
    'getter',
    'then',
    'self',
    'executor',
  ] as const)('removes listeners after %s settlement', async (kind) => {
    const controller = new AbortController()
    const reason = new Error('failure')
    let resolve!: (value: unknown) => void
    const promise = new AbortablePromise<unknown>((yes) => {
      resolve = yes
      if (kind === 'executor') throw reason
    }, controller)
    const outcome = promise.then(
      (value) => value,
      (caught: unknown) => caught,
    )
    if (kind === 'follow') {
      const native = Promise.resolve(1)
      void Object.defineProperty(native, 'constructor', {
        get() {
          throw reason
        },
      })
      resolve(native)
    }
    if (kind === 'native') resolve(Promise.resolve(1))
    if (kind === 'abortable') resolve(AbortablePromise.resolve(1))
    if (kind === 'thenable')
      resolve({
        then(yes: (value: number) => void) {
          yes(1)
        },
      })
    if (kind === 'getter')
      resolve({
        get then() {
          throw reason
        },
      })
    if (kind === 'then')
      resolve({
        then() {
          throw reason
        },
      })
    if (kind === 'self') resolve(promise)
    const result = await Promise.race([
      outcome,
      new Promise((r) => setTimeout(() => r('pending'), 0)),
    ])
    if (kind === 'self') expect(result).toBeInstanceOf(TypeError)
    else
      expect(result).toBe(
        ['getter', 'then', 'executor', 'follow'].includes(kind) ? reason : 1,
      )
    expect(listeners(controller.signal)).toHaveLength(0)
  })

  it('keeps synchronous executor settlement when constructor removal throws', async () => {
    const controller = new AbortController()
    const error = new Error('removal')
    const remove = controller.signal.removeEventListener.bind(controller.signal)
    let removals = 0
    controller.signal.removeEventListener = (
      ...args: Parameters<AbortSignal['removeEventListener']>
    ) => {
      removals++
      remove(...args)
      throw error
    }
    const promise = new AbortablePromise<number>(
      (resolve) => resolve(1),
      controller,
    )
    expect(
      await Promise.race([
        promise,
        new Promise((r) => setTimeout(() => r('pending'), 0)),
      ]),
    ).toBe(1)
    expect(removals).toBe(1)
    expect(listeners(controller.signal)).toHaveLength(0)
  })

  it.each(['fulfilling', 'rejecting'] as const)(
    'settles a %s adoption and reports its removal error as an unhandled rejection',
    async (kind) => {
      const error = new Error('removal')
      const reason = new Error('reason')
      let outcome!: Promise<unknown>
      const unhandled = await unhandledDuring(() => {
        const controller = new AbortController()
        controller.signal.removeEventListener = () => {
          throw error
        }
        const promise = new AbortablePromise<number>(
          (resolve) =>
            resolve(
              kind === 'fulfilling'
                ? Promise.resolve(1)
                : Promise.reject(reason),
            ),
          controller,
        )
        outcome = promise.then(
          (value) => value,
          (caught: unknown) => caught,
        )
      })
      expect(unhandled).toEqual([error])
      expect(
        await Promise.race([
          outcome,
          new Promise((r) => setTimeout(() => r('pending'), 0)),
        ]),
      ).toBe(kind === 'fulfilling' ? 1 : reason)
    },
  )

  it.each(['controller', 'link'] as const)(
    'preserves an earlier %s error over removal',
    async (kind) => {
      const earlier = new Error(kind)
      const removal = new Error('removal')
      class ThrowingController extends AbortController {
        override abort(): void {
          throw earlier
        }
      }
      const controller =
        kind === 'controller' ? new ThrowingController() : undefined
      const source = new AbortablePromise<number>(() => {}, controller)
      if (kind === 'link')
        source.abort = () => {
          throw earlier
        }
      const promise = kind === 'link' ? source.then((value) => value) : source
      const signal = new AbortController().signal
      signal.removeEventListener = () => {
        throw removal
      }
      void promise.abortOn(signal)
      const outcome = promise.catch((caught: unknown) => caught)
      expect(() => promise.abort()).toThrow(earlier)
      expect(isAbortError(await outcome)).toBe(true)
    },
  )
})
