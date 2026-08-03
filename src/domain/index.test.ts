import { describe, expect, it } from 'vitest'
import type {
  CompoundValueObject,
  DomainObjectDTO,
  DomainObjectFactory,
  Entity,
} from './index.js'
import { failure, isFailure, isSuccess, success } from '../result/index.js'

// Tuple-wrapped so the check doesn't distribute over union types.
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type Expect<T extends true> = T

type UserDTO = { id: string; name: string }
type User = Entity<string> & { readonly name: string }

const UserFactory: DomainObjectFactory<User, UserDTO> = {
  from(dto) {
    return dto.name.length > 0
      ? success({ id: dto.id, name: dto.name })
      : failure<User>(new Error('name must not be empty'))
  },
}

describe('DomainObjectFactory', () => {
  it('builds a domain object from an admissible DTO', () => {
    const outcome = UserFactory.from({ id: 'u1', name: 'Ada' })
    expect(isSuccess(outcome)).toBe(true)
    expect(outcome).toEqual({ id: 'u1', name: 'Ada' })
  })

  it('reports a Failure explaining why the DTO was not admissible', () => {
    const outcome = UserFactory.from({ id: 'u1', name: '' })
    expect(isFailure(outcome)).toBe(true)
  })
})

describe('type-level', () => {
  it('has no runtime assertions — this block only exists to host type checks', () => {
    expect(true).toBe(true)
  })

  // Entity: identity, not value, decides sameness — any shape carrying a
  // readonly `id`.
  type _EntityHasId = Expect<Equal<Entity<string>, { readonly id: string }>>

  // CompoundValueObject: several values expressed as one `key`.
  type _CompoundHasKey = Expect<
    Equal<CompoundValueObject<string>, { readonly key: string }>
  >

  type _DTOHasDto = Expect<
    Equal<DomainObjectDTO<UserDTO>, { readonly dto: UserDTO }>
  >

  const _typeTests: [_EntityHasId, _CompoundHasKey, _DTOHasDto] = [
    true,
    true,
    true,
  ]
  void _typeTests
})
