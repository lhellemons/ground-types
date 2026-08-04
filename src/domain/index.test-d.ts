import { describe, expectTypeOf, it } from 'vitest'
import type { DomainObjectFactory } from './index.js'
import type { Result } from '../result/index.js'

type UserDTO = { id: string; name: string }
type User = { readonly id: string; readonly name: string }

class InvalidUser extends Error {
  readonly code = 'invalid-user' as const
}

describe('DomainObjectFactory', () => {
  it('defaults the Failure type to Error', () => {
    expectTypeOf<DomainObjectFactory<User, UserDTO>['from']>().toEqualTypeOf<
      (dto: UserDTO) => Result<User, Error>
    >()
  })

  it('narrows the Failure type to a concrete Error subclass, ahead of TExtra', () => {
    expectTypeOf<
      DomainObjectFactory<User, UserDTO, InvalidUser>['from']
    >().toEqualTypeOf<(dto: UserDTO) => Result<User, InvalidUser>>()
  })

  it('keeps TExtra usable with its own default left in place', () => {
    expectTypeOf<
      DomainObjectFactory<User, UserDTO, InvalidUser, [actorId: string]>['from']
    >().toEqualTypeOf<
      (dto: UserDTO, actorId: string) => Result<User, InvalidUser>
    >()
  })
})
