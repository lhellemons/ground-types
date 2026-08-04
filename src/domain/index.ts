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
 * The seam that recovers a domain object's DTO: a readonly `dto` built
 * from the object's own current values, the mirror of what a {@link
 * DomainObjectFactory}'s `from` validated it out of in the first place.
 * Not the DTO itself — see CONTEXT.md's DTO Source entry.
 */
export type DTOSource<TDTO> = { readonly dto: TDTO }

/**
 * The construction seam of a domain object: takes a DTO (plus any `extra`
 * arguments the construction needs) and returns either the domain object or
 * a `Failure` explaining why the DTO was not admissible. The only
 * sanctioned way to turn untrusted data into a domain object.
 *
 * `E` defaults to `Error`, but a factory can narrow it to a concrete
 * subclass — e.g. `DomainObjectFactory<User, UserDTO, InvalidUser>` — so a
 * caller can branch on the specific reason a DTO was rejected, per
 * CONTEXT.md's Failure entry. `E` sits ahead of `TExtra`; both default, so
 * a factory with no extra arguments names neither.
 */
export type DomainObjectFactory<
  TDomain,
  TDTO,
  E extends Error = Error,
  TExtra extends unknown[] = [],
> = {
  from(dto: TDTO, ...extra: TExtra): Result<TDomain, E>
}
