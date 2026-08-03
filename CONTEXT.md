# Context — ground-types

The ubiquitous language of this library. Use these exact terms in code,
docs, and issues. This file is a glossary and nothing else: no
implementation notes, no roadmap, no rationale for design decisions
(those belong in `docs/adr/`).

The library has two halves that are designed together, not merged by
accident: the **functional primitives** (Maybe, Result, and the
composition helpers over them) and the **domain building blocks** (Brand,
Value Object, Entity, and their factories). The building blocks are
expressed in terms of the primitives — a factory reports failure as a
Result — never the reverse.

## Ground Type

A type with no free type variables: fully concrete, standing on nothing
further. The library's name claims that the types here are the concrete
ground your domain model is built on, and that they are the groundwork
laid before any domain modelling starts.

## Functional primitives

### Maybe

A value that may be absent, encoded unboxed as `T | undefined`. `Maybe`
is the type; **Just** is the present case and **Nothing** the absent
one. A Maybe never wraps another Maybe — `Maybe<Maybe<T>>` and `Maybe<T>`
are mutually assignable, so nesting cannot be represented, not merely
avoided by convention.

_Avoid_: Option, Some, None, nullable.

### Result

The outcome of a fallible operation: either a **Success** carrying the
value, or a **Failure** carrying an `Error`. Unboxed — a Success _is_
the value and a Failure _is_ the Error, discriminated by
`instanceof Error`. Because the encoding is unboxed, a Result of a
Result cannot be represented; chaining a second fallible step is
`andThen`, never nested `map`.

_Avoid_: Either, Left, Right, Ok, Err, error tuple.

### Success

The value-carrying case of a Result. A Success is never an Error — that
exclusion is enforced in the type, which is what makes the unboxed
encoding safe.

### Failure

The Error-carrying case of a Result. A Failure keeps its concrete Error
subclass, so a caller can branch on the specific error type it was
given.

_Avoid_: Reason, fault, err.

## Domain building blocks

### Brand

A phantom marker attached to a type so that two structurally identical
types are not interchangeable. **Branded** is the type constructor that
applies a Brand to an underlying type. A Brand exists only at compile
time and has no runtime representation.

_Avoid_: Nominal, tag, opaque type, newtype.

### Value Object

A domain object defined entirely by its value, with no identity: two
Value Objects with equal values are the same Value Object. A
**Primitive Value Object** is the common case — a Branded primitive
(string, number, boolean, null) with a validating constructor. A
**Compound Value Object** is defined by several values at once and
carries a `key` that expresses them as one.

_Avoid_: Wrapper, struct, record, DTO (a DTO is the untrusted input a
Value Object is built _from_).

### Entity

A domain object with identity: it carries an `id`, and it stays the same
Entity as its values change. Identity, not value, decides sameness.

Note for readers coming from a consuming project: this is the tactical
DDD building block. A consumer's own glossary may forbid the word
"entity" for its own concepts — Slider does, reserving it so that its
Pieces are never called entities. That prohibition is about Slider's
language, not this library's, and the two do not conflict.

_Avoid_: Model, object, record, actor.

### DTO

The plain, untrusted data shape a domain object is constructed from and
serialised to. A DTO carries no invariants; validating a DTO into a
domain object is the factory's job.

_Avoid_: Payload, raw, JSON, props.

### Factory

The construction seam of a domain object: it takes a DTO, validates it,
and returns either the domain object or a Failure explaining why the DTO
was not admissible. A Factory is the only sanctioned way to turn
untrusted data into a domain object.

_Avoid_: Parser, validator, builder, constructor (a constructor cannot
report failure as a value).

### Intern

To canonicalise a Value Object so that equal values are represented by
one shared instance, making reference equality agree with value
equality. The **Intern Registry** holds those canonical instances.

_Avoid_: Cache, pool, memoize (interning is about identity of equals,
not about avoiding recomputation).
