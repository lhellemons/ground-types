import { describe, expect, it } from 'vitest'
import { definePrimitiveValueObject } from './index.js'
import type { Branded } from '../brand/index.js'
import { isFailure, isSuccess } from '../result/index.js'

type Email = Branded<string, 'Email'>

const Email = definePrimitiveValueObject<string, Email>((value) => {
  if (!value.includes('@')) {
    throw new Error(`invalid email: "${value}"`)
  }
  return value as Email
})

describe('definePrimitiveValueObject', () => {
  it('is callable directly, returning the branded value for valid input', () => {
    expect(Email('a@b.com')).toBe('a@b.com')
  })

  it('throws when called directly on invalid input', () => {
    expect(() => Email('not-an-email')).toThrow()
  })

  it('.from returns a Success for valid input', () => {
    const outcome = Email.from('a@b.com')
    expect(isSuccess(outcome)).toBe(true)
    expect(outcome).toBe('a@b.com')
  })

  it('.from returns a Failure for invalid input, without throwing', () => {
    const outcome = Email.from('not-an-email')
    expect(isFailure(outcome)).toBe(true)
  })
})
