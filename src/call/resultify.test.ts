import { describe, expect, it } from 'vitest'
import { isAbortError } from '../abort/index.js'
import { AbortablePromise, fail, recoverWith } from '../promise/index.js'
import { failure, success } from '../result/index.js'
import type { Result } from '../result/index.js'
import { RejectionError } from '../promise/index.js'
import { resultify } from './resultify.js'
import type { AbortableCall } from './types.js'

describe('resultify', () => {
  it('never rejects, but resolves with a Result', async () => {
    const resolvingCallWithInput = (input: string) => Promise.resolve(input)
    const rejectingCallWithInput = (input: string) => Promise.reject(input)

    await expect(
      resultify(fail, resolvingCallWithInput)('input'),
    ).resolves.toEqual(success('input'))
    await expect(
      resultify(fail, rejectingCallWithInput)('input'),
    ).resolves.toEqual(failure(new RejectionError('input')))
    await expect(
      resultify(recoverWith('recovered'), rejectingCallWithInput)('input'),
    ).resolves.toEqual(success('recovered'))

    const resolvingCallWithoutInput = () =>
      AbortablePromise.of(Promise.resolve('success'))
    const rejectingCallWithoutInput = () =>
      AbortablePromise.of(Promise.reject('failure'))

    await expect(resultify(fail, resolvingCallWithoutInput)()).resolves.toEqual(
      success('success'),
    )
    await expect(resultify(fail, rejectingCallWithoutInput)()).resolves.toEqual(
      failure(new RejectionError('failure')),
    )
    await expect(
      resultify(recoverWith('recovered'), rejectingCallWithoutInput)(),
    ).resolves.toEqual(success('recovered'))
  })

  it('works in curried mode', async () => {
    const liftCall = resultify<Error, string, string>(fail)
    const lifted = liftCall((input: string) => Promise.reject(input))

    await expect(lifted('input')).resolves.toEqual(
      failure(new RejectionError('input')),
    )
  })

  it('can be aborted if the original call produces an AbortablePromise', async () => {
    // The Result's success type never materialises here: the call never
    // resolves, so the only outcome is the abort.
    const abortableWithoutInput = resultify(
      fail,
      () => new AbortablePromise<string>(() => {}),
    ) as AbortableCall<Result<string>>

    const promise = abortableWithoutInput()
    promise.abort()

    // The AbortError reaches the caller rather than becoming a Failure: abort
    // rejects the AbortablePromise the Call returned, which is the promise
    // resultify wrapped, so there is nothing left to resolve with.
    await expect(promise).rejects.toSatisfy(isAbortError)

    const abortableWithInput = resultify(
      fail,
      (_: string) => new AbortablePromise<string>(() => {}),
    ) as AbortableCall<Result<string>, string>

    const promise2 = abortableWithInput('some input')
    promise2.abort()

    await expect(promise2).rejects.toSatisfy(isAbortError)
  })
})
