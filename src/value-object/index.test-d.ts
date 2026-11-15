import { describe, expectTypeOf, it } from 'vitest'
import { definePrimitiveValueObject } from './index.js'
import { catchOnly } from '../result/index.js'
import type { Branded } from '../brand/index.js'
import type { Result } from '../result/index.js'

type Email = Branded<string, 'Email'>

class InvalidEmail extends Error {
  readonly code = 'invalid-email' as const
}

describe('definePrimitiveValueObject', () => {
  it("defaults .from's Failure type to Error when no errorHandler is given", () => {
    const Email = definePrimitiveValueObject<Email>((value) => {
      if (!value.includes('@')) throw new Error(`invalid email: "${value}"`)
      return value as Email
    })

    expectTypeOf(Email.from('a@b.com')).toEqualTypeOf<Result<Email, Error>>()
  })

  it("narrows .from's Failure type to errorHandler's concrete Error subclass, given explicitly", () => {
    // A partial type-argument list never infers the rest, so naming T alone
    // leaves E at its default (docs/adr/0001, 2026-11-14 amendment). Naming
    // all three states E outright; with none, E infers from the handler.
    const Email = definePrimitiveValueObject<Email, string, InvalidEmail>(
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

  it("names only T explicitly, letting P default to string — the point of matching PrimitiveValueObject's T, P order", () => {
    const Email = definePrimitiveValueObject<Email>((value) => value as Email)

    expectTypeOf(Email.from).toEqualTypeOf<
      (value: string) => Result<Email, Error>
    >()
  })

  it('types .from as readonly, matching the frozen factory', () => {
    const Email = definePrimitiveValueObject<Email>((value) => value as Email)

    // @ts-expect-error `from` is frozen at runtime, so it is readonly in the type
    Email.from = () => new Error('replacement')
  })

  describe('with catchOnly', () => {
    const construct = (value: string): Email => {
      if (!value.includes('@')) throw new InvalidEmail('invalid email')
      return value as Email
    }

    it('infers E from the listed classes when no type arguments are given', () => {
      const Email = definePrimitiveValueObject(
        construct,
        catchOnly(InvalidEmail),
      )

      expectTypeOf(Email.from('a@b.com')).toEqualTypeOf<
        Result<Email, InvalidEmail>
      >()
    })

    it('names all three type arguments to keep E', () => {
      const Email = definePrimitiveValueObject<Email, string, InvalidEmail>(
        construct,
        catchOnly(InvalidEmail),
      )

      expectTypeOf(Email.from('a@b.com')).toEqualTypeOf<
        Result<Email, InvalidEmail>
      >()
    })

    it('widens E to Error when only T is named — a partial list never infers the rest', () => {
      const Email = definePrimitiveValueObject<Email>(
        construct,
        catchOnly(InvalidEmail),
      )

      expectTypeOf(Email.from('a@b.com')).toEqualTypeOf<Result<Email, Error>>()
    })
  })
})
