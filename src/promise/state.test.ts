import { describe, expect, it } from 'vitest'
import {
  fulfilled,
  initial,
  isFulfilled,
  isInitial,
  isPending,
  isRejected,
  isSettled,
  pending,
  rejected,
  settledResult,
  stateOf,
} from './state.js'
import { AbortablePromise } from './abortable.js'
import { RejectionError } from './types.js'
import { isAbortError } from '../abort/index.js'
import { isJust, isNothing } from '../maybe/index.js'
import { isFailure, isSuccess } from '../result/index.js'

describe('State constructors and guards', () => {
  it('each guard recognises only its own case', () => {
    const cases = [
      initial(),
      pending(),
      fulfilled('value'),
      rejected('reason'),
    ] as const
    const guards = [isInitial, isPending, isFulfilled, isRejected]

    guards.forEach((guard, guardIndex) => {
      cases.forEach((state, caseIndex) => {
        expect(guard(state)).toBe(guardIndex === caseIndex)
      })
    })
  })

  it('isSettled covers exactly the finished cases', () => {
    expect(isSettled(initial())).toBe(false)
    expect(isSettled(pending())).toBe(false)
    expect(isSettled(fulfilled('value'))).toBe(true)
    expect(isSettled(rejected('reason'))).toBe(true)
  })

  it('carries its payload', () => {
    expect(fulfilled('value')).toEqual({ status: 'fulfilled', value: 'value' })
    expect(rejected('reason')).toEqual({ status: 'rejected', reason: 'reason' })
  })
})

describe('settledResult', () => {
  it('is Nothing while the operation has not finished', () => {
    expect(isNothing(settledResult(initial()))).toBe(true)
    expect(isNothing(settledResult(pending()))).toBe(true)
  })

  it('is a Success once fulfilled', () => {
    const outcome = settledResult(fulfilled('value'))

    expect(isJust(outcome)).toBe(true)
    expect(isSuccess(outcome as string)).toBe(true)
    expect(outcome).toEqual('value')
  })

  it('narrows an arbitrary rejection reason to a Failure', () => {
    const outcome = settledResult(rejected('not an error'))

    expect(isFailure(outcome as Error)).toBe(true)
    expect(outcome).toBeInstanceOf(RejectionError)
  })

  it('keeps a rejection reason that is already an Error, class intact', () => {
    class WidgetError extends Error {}
    const outcome = settledResult(rejected(new WidgetError('boom')))

    expect(outcome).toBeInstanceOf(WidgetError)
  })

  it('lets an abort arrive as an AbortError', async () => {
    const promise = new AbortablePromise<string>(() => {})
    const tracked = stateOf(promise)

    promise.abort()
    await promise.catch(() => {})

    expect(isAbortError(settledResult(tracked.current))).toBe(true)
  })
})

describe('stateOf', () => {
  it('starts pending and never reports initial', () => {
    const tracked = stateOf(new Promise<string>(() => {}))
    expect(isPending(tracked.current)).toBe(true)
  })

  it('moves to fulfilled with the value', async () => {
    const promise = Promise.resolve('value')
    const tracked = stateOf(promise)

    await promise

    expect(tracked.current).toEqual(fulfilled('value'))
  })

  it('moves to rejected with the reason', async () => {
    const promise = Promise.reject('reason')
    const tracked = stateOf(promise)

    await promise.catch(() => {})

    expect(tracked.current).toEqual(rejected('reason'))
  })

  it('reads live rather than snapshotting', async () => {
    const promise = Promise.resolve('value')
    const tracked = stateOf(promise)

    expect(isPending(tracked.current)).toBe(true)
    await promise
    expect(isFulfilled(tracked.current)).toBe(true)
  })
})
