import { describe, expectTypeOf, it } from 'vitest'
import type {
  CompoundValueObject,
  DomainObjectFactory,
  DTOSource,
  Entity,
} from './index.js'
import type { Result } from '../result/index.js'

/**
 * Pins `/domain`'s type-only exports — invisible at runtime, so untouched by
 * `test/api-surface/domain.test.ts`. Referencing each by name means a
 * removal or rename fails typecheck instead of silently dropping from the
 * public surface. See that file's docblock for the full rationale.
 */
describe('/domain type exports', () => {
  it('Entity<TId> carries a readonly id', () => {
    expectTypeOf<Entity<string>>().toEqualTypeOf<{ readonly id: string }>()
  })

  it('CompoundValueObject<TKey> carries a readonly key', () => {
    expectTypeOf<CompoundValueObject<string>>().toEqualTypeOf<{
      readonly key: string
    }>()
  })

  it('DTOSource<TDTO> carries a readonly dto', () => {
    expectTypeOf<DTOSource<{ id: string }>>().toEqualTypeOf<{
      readonly dto: { id: string }
    }>()
  })

  it("DomainObjectFactory<TDomain, TDTO, E, TExtra>'s from defaults E to Error and TExtra to no extra args", () => {
    expectTypeOf<
      DomainObjectFactory<{ id: string }, { id: string }>['from']
    >().toEqualTypeOf<(dto: { id: string }) => Result<{ id: string }, Error>>()
  })

  it("DomainObjectFactory's E narrows the Failure type, ahead of TExtra", () => {
    class Invalid extends Error {}

    expectTypeOf<
      DomainObjectFactory<
        { id: string },
        { id: string },
        Invalid,
        [actorId: string]
      >['from']
    >().toEqualTypeOf<
      (dto: { id: string }, actorId: string) => Result<{ id: string }, Invalid>
    >()
  })
})
