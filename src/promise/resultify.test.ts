import { describe, expect, it } from 'vitest'
import { fail, recoverWith, resultify } from './resultify.js'
import { failure, success } from '../result/index.js'
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
})
