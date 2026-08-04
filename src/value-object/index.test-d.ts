import { describe, expectTypeOf, it } from 'vitest'
import { definePrimitiveValueObject } from './index.js'
import type { Branded } from '../brand/index.js'
import type { Result } from '../result/index.js'

type Email = Branded<string, 'Email'>

class InvalidEmail extends Error {
  readonly code = 'invalid-email' as const
}

describe('definePrimitiveValueObject', () => {
  it("defaults .from's Failure type to Error when no errorHandler is given", () => {
    const Email = definePrimitiveValueObject<string, Email>((value) => {
      if (!value.includes('@')) throw new Error(`invalid email: "${value}"`)
      return value as Email
    })

    expectTypeOf(Email.from('a@b.com')).toEqualTypeOf<Result<Email, Error>>()
  })

  it("narrows .from's Failure type to errorHandler's concrete Error subclass, given explicitly", () => {
    // E is not reliably inferred from errorHandler's return type alone — the
    // same Result invariance documented in ADR-0001's 2026-08-04 amendment
    // (Success's `E` phantom makes Result invariant in E) applies here too,
    // confirmed by trying inference-only first and watching it default back
    // to Error. Naming E explicitly alongside T is the fix, same as
    // constructing a Result directly at a narrowly-typed call site.
    const Email = definePrimitiveValueObject<string, Email, InvalidEmail>(
      (value) => {
        if (!value.includes('@')) throw new Error(`invalid email: "${value}"`)
        return value as Email
      },
      (): Result<Email, InvalidEmail> => new InvalidEmail('invalid email'),
    )

    expectTypeOf(Email.from('a@b.com')).toEqualTypeOf<
      Result<Email, InvalidEmail>
    >()
  })
})
