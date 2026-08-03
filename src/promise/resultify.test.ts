import { describe, expect, it } from 'vitest'
import { isAbortError } from '../abort/index.js'
import { fail, recoverWith, resultify } from './resultify.js'
import { failure, success } from '../result/index.js'
import type { Result } from '../result/index.js'
import { RejectionError } from './types.js'
import { AbortablePromise } from './abortable.js'
import type { AbortableCall } from '../call/index.js'
import { resultifyCall } from '../call/index.js'

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
})

describe('resultifyCall', () => {
  it('never rejects, but resolves with a Result', async () => {
    const resolvingCallWithInput = (input: string) => Promise.resolve(input)
    const rejectingCallWithInput = (input: string) => Promise.reject(input)

    await expect(
      resultifyCall(fail, resolvingCallWithInput)('input'),
    ).resolves.toEqual(success('input'))
    await expect(
      resultifyCall(fail, rejectingCallWithInput)('input'),
    ).resolves.toEqual(failure(new RejectionError('input')))
    await expect(
      resultifyCall(recoverWith('recovered'), rejectingCallWithInput)('input'),
    ).resolves.toEqual(success('recovered'))

    const resolvingCallWithoutInput = () =>
      AbortablePromise.of(Promise.resolve('success'))
    const rejectingCallWithoutInput = () =>
      AbortablePromise.of(Promise.reject('failure'))

    await expect(
      resultifyCall(fail, resolvingCallWithoutInput)(),
    ).resolves.toEqual(success('success'))
    await expect(
      resultifyCall(fail, rejectingCallWithoutInput)(),
    ).resolves.toEqual(failure(new RejectionError('failure')))
    await expect(
      resultifyCall(recoverWith('recovered'), rejectingCallWithoutInput)(),
    ).resolves.toEqual(success('recovered'))
  })
  it('can be aborted if the original call produces an AbortablePromise', async () => {
    const resultifiedAbortableCallWithoutInput = resultifyCall(
      fail,
      () => new AbortablePromise<string>(() => {}),
    ) as AbortableCall<Result<string>> // the type of the Result doesn't matter because it will never be a Success

    const promise = resultifiedAbortableCallWithoutInput()
    promise.abort()

    await expect(promise).rejects.toSatisfy(isAbortError) // The AbortError passes through fail because it's an Error

    const resultifiedAbortableCallWithInput = resultifyCall(
      fail,
      (_: string) => new AbortablePromise<string>(() => {}),
    ) as AbortableCall<Result<string>, string> // the type of the Result doesn't matter because it will never be a Success

    const promise2 = resultifiedAbortableCallWithInput('some input')
    promise2.abort()

    await expect(promise2).rejects.toSatisfy(isAbortError) // The AbortError passes through fail because it's an Error
  })
})
