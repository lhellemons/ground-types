import { describe, expect, it } from 'vitest'
import { isAbortError } from '../abort/index.js'
import { fakeAbortablePromise, fakePromise } from './fake.js'

describe('fakePromise', () => {
  it('creates a Promise with manual resolve and reject methods', async () => {
    const p1 = fakePromise()

    p1.resolve('value')
    await expect(p1).resolves.toEqual('value')

    const p2 = fakePromise()
    p2.reject('reason')
    await expect(p2).rejects.toEqual('reason')
  })
})

describe('fakeAbortablePromise', () => {
  it('creates an AbortablePromise with manual resolve and reject methods', async () => {
    const p1 = fakeAbortablePromise()

    p1.resolve('value')
    await expect(p1).resolves.toEqual('value')

    const p2 = fakeAbortablePromise()
    p2.reject('reason')
    await expect(p2).rejects.toEqual('reason')

    const p3 = fakeAbortablePromise()
    p3.abort()
    await expect(p3).rejects.toSatisfy(isAbortError)
  })
})
