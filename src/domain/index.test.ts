import { describe, expect, it } from 'vitest'
import type {
  CompoundValueObject,
  DomainObjectDTO,
  DomainObjectFactory,
  Entity,
} from './index.js'
import {
  assertSuccess,
  failure,
  isFailure,
  isSuccess,
  success,
  tryCatch,
} from '../result/index.js'
import type { Result } from '../result/index.js'
import { InternRegistry, internByKey } from '../intern-registry/index.js'

// Tuple-wrapped so the check doesn't distribute over union types.
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type Expect<T extends true> = T

type UserDTO = { id: string; name: string }
type User = Entity<string> & { readonly name: string }

const UserFactory: DomainObjectFactory<User, UserDTO> = {
  from(dto) {
    return dto.name.length > 0
      ? success({ id: dto.id, name: dto.name })
      : failure<Error, User>(new Error('name must not be empty'))
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

class EmptyName extends Error {
  readonly code = 'empty-name' as const
}

const StrictUserFactory: DomainObjectFactory<User, UserDTO, EmptyName> = {
  from(dto) {
    // success<User, EmptyName>(...) is spelled out explicitly: Success's `E`
    // phantom is invariant (docs/adr/0001, 2026-08-04 amendment), so the
    // plain `success(...)` call below would default E to Error and fail to
    // satisfy this factory's narrower Result<User, EmptyName>.
    return dto.name.length > 0
      ? success<User, EmptyName>({ id: dto.id, name: dto.name })
      : failure<EmptyName, User>(new EmptyName('name must not be empty'))
  },
}

describe('DomainObjectFactory with a concrete Failure subclass', () => {
  it('lets a caller branch on the specific Error subclass a Failure carries', () => {
    const outcome = StrictUserFactory.from({ id: 'u1', name: '' })
    expect(isFailure(outcome)).toBe(true)
    expect(outcome).toBeInstanceOf(EmptyName)
    if (isFailure(outcome)) {
      expect(outcome.code).toBe('empty-name')
    }
  })
})

type PointDTO = { x: number; y: number }
type PointKey = string

const pointRegistry = new InternRegistry<PointKey, Point>()

class Point
  implements CompoundValueObject<PointKey>, DomainObjectDTO<PointDTO>
{
  readonly key: PointKey
  readonly x: number
  readonly y: number

  private constructor(key: PointKey, x: number, y: number) {
    this.key = key
    this.x = x
    this.y = y
  }

  static {
    void (Point satisfies DomainObjectFactory<Point, PointDTO>)
  }

  static from(dto: PointDTO): Result<Point, Error> {
    return tryCatch((dto: PointDTO) => {
      const key: PointKey = `${dto.x},${dto.y}`
      return internByKey(pointRegistry, key, () => new Point(key, dto.x, dto.y))
    })(dto)
  }

  get dto(): PointDTO {
    return { x: this.x, y: this.y }
  }
}

describe('DomainObjectDTO round-trip', () => {
  it('round-trips: from(dto).dto equals the original dto', () => {
    const point = assertSuccess(Point.from({ x: 1, y: 2 }))
    expect(point.dto).toEqual({ x: 1, y: 2 })
  })

  it('interns equal DTOs to the same instance, so value equality holds via reference equality', () => {
    const a = assertSuccess(Point.from({ x: 3, y: 4 }))
    const b = assertSuccess(Point.from({ x: 3, y: 4 }))
    expect(a).toBe(b)
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
