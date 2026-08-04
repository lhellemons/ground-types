import type { Result } from '../result/index.js'

/**
 * A domain object with identity: it carries a readonly `id`, and identity
 * — not value — decides sameness as its values change.
 */
export type Entity<TId> = { readonly id: TId }

/**
 * A Value Object defined by several values at once, carrying a readonly
 * `key` that expresses them as one. Use `value-object`'s
 * `PrimitiveValueObject` instead for the single-primitive case.
 */
export type CompoundValueObject<TKey> = { readonly key: TKey }

/**
 * The plain, untrusted data shape a domain object is constructed from and
 * serialised to. A DTO carries no invariants; a {@link DomainObjectFactory}
 * is what validates one into a domain object.
 */
export type DomainObjectDTO<TDTO> = { readonly dto: TDTO }

/**
 * The construction seam of a domain object: takes a DTO (plus any `extra`
 * arguments the construction needs) and returns either the domain object or
 * a `Failure` explaining why the DTO was not admissible. The only
 * sanctioned way to turn untrusted data into a domain object.
 *
 * `E` defaults to `Error`, but a factory can narrow it to a concrete
 * subclass — e.g. `DomainObjectFactory<User, UserDTO, InvalidUser>` — so a
 * caller can branch on the specific reason a DTO was rejected, per
 * CONTEXT.md's Failure entry. It sits ahead of `TExtra` because, like
 * `Result<T, E>`, it describes the shape of `from`'s return value rather
 * than an input; `TExtra` describes extra input and keeps its own default
 * so a factory with no extra arguments never has to name either.
 */
export type DomainObjectFactory<
  TDomain,
  TDTO,
  E extends Error = Error,
  TExtra extends unknown[] = [],
> = {
  from(dto: TDTO, ...extra: TExtra): Result<TDomain, E>
}
