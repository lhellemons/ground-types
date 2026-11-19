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
 * A domain object's capability to produce a DTO of its current values.
 * Where a Factory built the object, the DTO round-trips through that
 * Factory; a Domain Error has no Factory and its DTO goes one way.
 */
export type DTOSource<TDTO> = { readonly dto: TDTO }

/**
 * A JSON value: a primitive, readonly array or string-keyed object of
 * nested JSON values. Used to bound Domain Error params at compile time.
 * Structural typing accepts an empty class with an explicit JSON-valued
 * string index signature, but rejects an ordinary empty class.
 */
export type JSONValue =
  | string
  | number
  | boolean
  | null
  | readonly JSONValue[]
  | { readonly [key: string]: JSONValue }

/**
 * The one-way DTO of a Domain Error, carrying its rule code and params.
 * Serialise `error.dto` to send it to a UI or across the wire.
 */
export type ErrorDTO<TCode extends string, TParams extends JSONValue> = {
  readonly code: TCode
  readonly params: TParams
}

/**
 * A Failure naming a broken domain rule with a literal code and JSON-valued
 * params. Extend it with a code and params type for each kind of rule.
 * Recognise it with `instanceof` or `catchOnly(DomainError)` from `/result`.
 * Serialise `error.dto` explicitly: without `toJSON`, serialising the error
 * itself includes its enumerable own fields, including subclass fields.
 * The DTO keeps params by reference and has no Factory back to an error.
 */
export abstract class DomainError<
  TCode extends string,
  TParams extends JSONValue,
>
  extends Error
  implements DTOSource<ErrorDTO<TCode, TParams>>
{
  constructor(
    readonly code: TCode,
    readonly params: TParams,
    message?: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = new.target.name
  }

  get dto(): ErrorDTO<TCode, TParams> {
    return { code: this.code, params: this.params }
  }
}

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
