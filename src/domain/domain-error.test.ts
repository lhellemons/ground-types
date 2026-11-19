import { describe, expect, it } from 'vitest'
import { DomainError } from './index.js'
import type { JSONValue } from './index.js'
import { catchOnly, isFailure } from '../result/index.js'

class Missing extends DomainError<'missing', { id: string }> {
  constructor(id = 'a') {
    super('missing', { id }, 'Missing', { cause: new Error('cause') })
  }
}
class DeepMissing extends Missing {
  readonly detail = 'extra'
}
class Other extends DomainError<'other', null> {
  constructor() {
    super('other', null)
  }
}

describe('DomainError', () => {
  it('uses the concrete name through two levels and keeps Error metadata', () => {
    const error = new DeepMissing()
    expect(error.name).toBe('DeepMissing')
    expect(error.message).toBe('Missing')
    expect(error.cause).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(Error)
  })

  it('exposes only code and params in the DTO, keeping params by reference', () => {
    const error = new DeepMissing()
    expect(error.dto.params).toBe(error.params)
    expect(Object.keys(error.dto)).toEqual(['code', 'params'])
    expect(JSON.parse(JSON.stringify(error.dto))).toEqual({
      code: 'missing',
      params: { id: 'a' },
    })
    expect(JSON.parse(JSON.stringify(error))).toEqual({
      name: 'DeepMissing',
      code: 'missing',
      params: { id: 'a' },
      detail: 'extra',
    })
    expect('toJSON' in error).toBe(false)
  })

  it('keeps all subclasses as Failures and rethrows everything else', () => {
    const handle = catchOnly(DomainError)
    for (const error of [new Missing(), new DeepMissing(), new Other()]) {
      expect(handle(error)).toBe(error)
      expect(isFailure(handle(error))).toBe(true)
    }
    for (const value of [new Error(), { code: 'missing' }, null, 'oops']) {
      try {
        handle(value)
        expect.unreachable()
      } catch (caught) {
        expect(caught).toBe(value)
      }
    }
    const precise = catchOnly(Missing)
    const error = new DeepMissing()
    expect(precise(error)).toBe(error)
    const other = new Other()
    try {
      precise(other)
      expect.unreachable()
    } catch (caught) {
      expect(caught).toBe(other)
    }
  })

  it('leaves JSON runtime limitations visible', () => {
    class Numeric extends DomainError<'numeric', readonly number[]> {}
    expect(
      JSON.parse(JSON.stringify(new Numeric('numeric', [NaN, Infinity]).dto)),
    ).toEqual({ code: 'numeric', params: [null, null] })
    const cycle: { self?: unknown } = {}
    cycle.self = cycle
    // Deliberate untyped boundary: the library performs no runtime validation.
    class Cyclic extends DomainError<'cycle', JSONValue> {}
    expect(() =>
      JSON.stringify(new Cyclic('cycle', cycle as never).dto),
    ).toThrow(TypeError)
  })
})
