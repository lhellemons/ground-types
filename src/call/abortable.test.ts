import { describe, expect, it } from 'vitest'
import { isAbortError } from '../abort/index.js'
import { AbortablePromise } from '../promise/index.js'
import { abortable } from './abortable.js'

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
