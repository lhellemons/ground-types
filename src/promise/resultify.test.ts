import { describe, expect, it } from 'vitest'
import { fail, recoverWith, resultify } from './resultify.js'
import { AbortablePromise } from './abortable.js'
import { isAbortError } from '../abort/index.js'
import { failure, isFailure, map, orElse, success } from '../result/index.js'
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
