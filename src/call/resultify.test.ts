import { describe, expect, it } from 'vitest'
import { isAbortError } from '../abort/index.js'
import { AbortablePromise, fail, recoverWith } from '../promise/index.js'
import { resultify as promiseResultify } from '../promise/index.js'
import { failure, isFailure, success } from '../result/index.js'
import type { Result } from '../result/index.js'
import { RejectionError } from '../promise/index.js'
import { abortable } from './abortable.js'
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
    // <O, E, I> — the same order as promise/resultify<O, E>, plus the input.
    const liftCall = resultify<string, Error, string>(fail)
    const lifted = liftCall((input: string) => Promise.reject(input))

    await expect(lifted('input')).resolves.toEqual(
      failure(new RejectionError('input')),
    )
  })

  it('produces a Call whose promise is not abortable', () => {
    const lifted = resultify(fail, () => new AbortablePromise<string>(() => {}))
    const promise = lifted()

    // Lifting hides the AbortablePromise it created, and resultify strips
    // abortability so that abort keeps one meaning. A Call that must stay
    // cancellable is lifted at the point of use instead — see below.
    expect(promise).not.toBeInstanceOf(AbortablePromise)
    expect((promise as { abort?: unknown }).abort).toBeUndefined()
  })

  it('stays cancellable when lifted at the point of use', async () => {
    // The pattern that keeps both properties: hold the AbortablePromise the
    // Call returns, and lift where the Result is consumed.
    const call: AbortableCall<string, string> = abortable(
      (_: string) => new AbortablePromise<string>(() => {}),
    )

    const inFlight = call('some input')
    const outcome: Promise<Result<string>> = promiseResultify(fail, inFlight)

    inFlight.abort()

    await expect(outcome).resolves.toSatisfy(isFailure)
    await expect(outcome).resolves.toSatisfy(isAbortError)
  })
})
