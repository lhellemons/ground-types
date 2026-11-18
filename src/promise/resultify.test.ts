import { describe, expect, it } from 'vitest'
import { fail, recoverWith, resultify } from './resultify.js'
import { AbortablePromise } from './abortable.js'
import { isAbortError } from '../abort/index.js'
import {
  failure,
  isFailure,
  map,
  orElse,
  success,
  ThrownError,
} from '../result/index.js'
import { RejectionError } from './types.js'

describe('resultify', () => {
  it('always resolves, with a Result', async () => {
    await expect(resultify(fail, Promise.resolve('success'))).resolves.toEqual(
      success('success'),
    )
    await expect(
      resultify(fail, Promise.reject('some reason')),
    ).resolves.toEqual(failure(new RejectionError('some reason')))
    await expect(
      resultify(recoverWith('recovered'), Promise.reject('some reason')),
    ).resolves.toEqual(success('recovered'))
  })

  it('resolves even when the rejection reason cannot be rendered', async () => {
    // RejectionError exists for reasons that are not well-behaved Errors — and
    // a symbol or a null-prototype object throws when interpolated into a
    // message. That throw escaped `fail` and rejected the lifted promise,
    // breaking the one thing resultify promises.
    const symbol = Symbol('unrenderable')
    const noPrototype = Object.create(null) as object

    expect(new RejectionError(symbol).message).toBe(
      'promise rejected with Symbol(unrenderable)',
    )
    expect(new RejectionError(noPrototype).message).toBe(
      'promise rejected with [object Object]',
    )

    await expect(resultify(fail, Promise.reject(symbol))).resolves.toEqual(
      failure(new RejectionError(symbol)),
    )
    await expect(resultify(fail, Promise.reject(noPrototype))).resolves.toEqual(
      failure(new RejectionError(noPrototype)),
    )
  })

  it('resolves to a Failure when ThrownError.describe is replaced by a function that throws', async () => {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- restored below, never called detached
    const original = ThrownError.describe
    let outcome: unknown
    try {
      ThrownError.describe = () => {
        throw new RangeError('describe replaced')
      }
      outcome = await resultify(fail, Promise.reject('x'))
    } finally {
      ThrownError.describe = original
    }

    expect(outcome).toBeInstanceOf(RejectionError)
    expect((outcome as RejectionError).message).toBe('promise rejected with x')
  })

  it('wraps a rejection reason whose Error guard throws, not the guard error', async () => {
    // `reason instanceof Error` throws for a Proxy whose `getPrototypeOf`
    // trap throws; that RangeError must not replace the reason.
    const hostile = new Proxy(
      {},
      {
        getPrototypeOf(): never {
          throw new RangeError('trap')
        },
      },
    )
    const result = await resultify(fail, Promise.reject(hostile))
    expect(isFailure(result)).toBe(true)
    expect(result).toBeInstanceOf(RejectionError)
    expect((result as RejectionError).reason).toBe(hostile)
    const direct = fail(hostile) as RejectionError
    expect(direct).toBeInstanceOf(RejectionError)
    expect(direct.reason).toBe(hostile)
  })

  it('wraps a rejection reason that replaces String or Object.prototype.toString while it is classified', async () => {
    // The `getPrototypeOf` trap runs inside `fail`'s Error check, before the
    // message is rendered: a replacement that returns a symbol, or an object
    // whose `toString` throws, would make the message template throw out of
    // `fail`, and `resultify(fail, …)` would reject, if `describeThrown`
    // looked it up then. `Object.prototype.toString` is only reached when
    // `String` throws, which the `get` trap arranges.
    const originalString = globalThis.String
    // eslint-disable-next-line @typescript-eslint/unbound-method -- restored below, never called detached
    const originalToString = Object.prototype.toString
    const throwingGet = {
      get(): never {
        throw new RangeError('get')
      },
    }
    const cases: {
      install: () => void
      traps: ProxyHandler<object>
      message: string
    }[] = [
      {
        install: () => {
          globalThis.String = (() => Symbol('x')) as never
        },
        traps: {},
        message: 'promise rejected with [object Object]',
      },
      {
        install: () => {
          globalThis.String = (() => ({
            toString(): never {
              throw new RangeError('toString')
            },
          })) as never
        },
        traps: {},
        message: 'promise rejected with [object Object]',
      },
      {
        install: () => {
          Object.prototype.toString = () => Symbol('x') as never
        },
        traps: throwingGet,
        message: 'promise rejected with [object Unknown]',
      },
    ]
    const hostile = (install: () => void, traps: ProxyHandler<object>) =>
      new Proxy(
        {},
        {
          ...traps,
          getPrototypeOf(): object {
            install()
            return Object.prototype
          },
        },
      )
    const restore = () => {
      globalThis.String = originalString
      Object.prototype.toString = originalToString
    }
    for (const { install, traps, message } of cases) {
      const direct = hostile(install, traps)
      const lifted = hostile(install, traps)
      let directResult: unknown
      let liftedResult: unknown
      try {
        directResult = fail(direct)
        restore()
        liftedResult = await resultify(fail, Promise.reject(lifted))
      } finally {
        restore()
      }

      expect(directResult).toBeInstanceOf(RejectionError)
      expect((directResult as RejectionError).reason).toBe(direct)
      expect((directResult as RejectionError).message).toBe(message)
      expect(liftedResult).toBeInstanceOf(RejectionError)
      expect((liftedResult as RejectionError).reason).toBe(lifted)
      expect((liftedResult as RejectionError).message).toBe(message)
    }
  })

  it('works in curried mode', async () => {
    const resultifyFail = resultify<string, Error>(fail) // as Mapper<Promise<string>, Promise<Result<string>>;
    const resultifyRecover = resultify(recoverWith('recovered'))

    await expect(resultifyFail(Promise.resolve('success'))).resolves.toEqual(
      success('success'),
    )
    await expect(resultifyFail(Promise.reject('some reason'))).resolves.toEqual(
      failure(new RejectionError('some reason')),
    )
    await expect(
      resultifyRecover(Promise.reject('some reason')),
    ).resolves.toEqual(success('recovered'))
  })

  it('lets the Result combinators drop straight into a promise chain', async () => {
    // The point of the asynchrony layer standing on the primitives: because
    // every Result combinator is unary, `.then` composes with them directly.
    // No mapAsync, no AsyncResult type, no second vocabulary.
    const label = (code: number) => `widget-${code}`

    await expect(
      resultify(fail, Promise.resolve(7)).then(map(label)),
    ).resolves.toEqual('widget-7')

    await expect(
      resultify(fail, Promise.reject('gone'))
        .then(map(label))
        .then(orElse('no widget')),
    ).resolves.toEqual('no widget')
  })

  it('hands back a plain Promise even when lifting an AbortablePromise', () => {
    const lifted = resultify(fail, new AbortablePromise<string>(() => {}))

    // Not merely "does not expose abort" — it must not be an AbortablePromise
    // at all, since that class rejects on its own abort by construction.
    expect(lifted).not.toBeInstanceOf(AbortablePromise)
    expect((lifted as { abort?: unknown }).abort).toBeUndefined()
  })

  it('resolves with a Failure when the source is aborted', async () => {
    const source = new AbortablePromise<string>(() => {})
    const lifted = resultify(fail, source)

    source.abort()

    const outcome = await lifted
    expect(isFailure(outcome)).toBe(true)
    expect(isAbortError(outcome)).toBe(true)
  })

  it('gives an abort one outcome, whichever reference is held', async () => {
    // The regression this guards: while the lifted promise was abortable,
    // aborting it rejected with an AbortError while aborting the source
    // resolved with a Failure — the same abort, two outcomes.
    const source = new AbortablePromise<string>(() => {})
    const lifted = resultify(fail, source)

    source.abort()

    await expect(lifted).resolves.toSatisfy(isFailure)
    await expect(lifted).resolves.toSatisfy(isAbortError)
  })
})
