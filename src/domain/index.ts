import type { Result } from '../result/index.js'

export type Entity<TId> = { readonly id: TId }

export type CompoundValueObject<TKey> = { readonly key: TKey }

export type DomainObjectDTO<TDTO> = { readonly dto: TDTO }

export type DomainObjectFactory<
  TDomain,
  TDTO,
  TExtra extends unknown[] = [],
> = {
  from(dto: TDTO, ...extra: TExtra): Result<TDomain, Error>
}
