# Context — ground-types

The ubiquitous language of this library. Use these exact terms in code,
docs, and issues. This file is a glossary and nothing else: no
implementation notes, no roadmap, no rationale for design decisions
(those belong in `docs/adr/`).

The library has three parts, designed together rather than merged by
accident: the **functional primitives** (Maybe, Result, and the
composition helpers over them), the **domain building blocks** (Brand,
Value Object, Entity, and their factories), and the **asynchrony
vocabulary** (Call, Abortable Promise, Abort, State).

Dependencies run one way, and only one way. The building blocks are
expressed in terms of the primitives — a factory reports failure as a
Result — never the reverse. The asynchrony vocabulary is expressed in
terms of the primitives too: an asynchronous operation reports failure as
a Result, and a Result never knows anything about asynchrony.

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

### Mapper

A function of exactly one argument: the unary special case of Function,
and the shape the combinators compose over. To **compose** two Mappers is
to read them right to left — `compose(f, g)(x)` is `f(g(x))`. To **pipe**
them is to read them left to right — `pipe(f, g)(x)` is `g(f(x))`. The
two differ only in argument order, so naming them apart matters: reaching
for the wrong one applies the transformations backwards rather than
failing. To **curry** is to let a function either take its input now or
hand back a Mapper that will take it later, decided by how many arguments
were passed and never by their value.

_Avoid_: Transformer, converter, flow, chain, partial application.

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

## Asynchrony

### Call

A function that performs an action, produces data, or both. A Call may
take an input or not, may produce an output or not, and may settle
synchronously or asynchronously. An **Abortable Call** is one that always
returns an Abortable Promise.

A Call is the thing you invoke, never the work in flight — the work in
flight is an Abortable Promise.

_Avoid_: Task (in TypeScript FP a `Task<A>` is `() => Promise<A>`: no
input, always async, which a Call is not), Operation, Command, Action,
Job, Handler.

### Abortable Promise

A Promise that can be aborted at any point before it settles, rejecting
with an Abort Error when it is. Abort propagates upstream: aborting a
promise derived through `then` aborts the one it derived from, so a chain
aborts as one unit.

To **detach** an Abortable Promise is to sever that upstream link, giving
it an abort lifetime of its own while it still settles from its source.
Reach for it at a branch point, where two consumers share one source and
neither should be able to cancel the other. See
[docs/adr/0002-abort-propagation.md](./docs/adr/0002-abort-propagation.md).

_Avoid_: Cancellable promise, deferred, future, task.

### Abort

To stop an operation in flight, through an `AbortSignal`. An **Abort
Error** is what an aborted operation rejects with. It carries the
platform's `AbortError` name, so an abort raised by this library and one
raised by `fetch` are indistinguishable — which is why aborts are
recognised by that name rather than by class or by identity.

Because an Abort Error is an Error, it is a Failure: an abort travels
through `Result`-returning code with its concrete class intact.

_Avoid_: Cancel, cancellation, terminate, kill, interrupt.

### State

Where an asynchronous operation currently is: initial, pending,
fulfilled, or rejected. An operation that has finished, either way, is
**settled**.

State is about time; Result is about outcome. Only State has a case for
an operation that has not finished, and only Result guarantees an Error
in its failing case — a rejection can carry anything at all, which is
what `fail` exists to narrow. The **settled Result** of a State is
therefore a Maybe: Nothing while the operation is still running, because
a Result answers a question an unfinished operation has not yet answered.
An operation that produces nothing is the exception the encoding cannot
express: its Success is absent, and so is Nothing, so the settled Result
of a finished action is indistinguishable from that of a running one.
Ask whether such an operation is settled, not what its Result is.

Unlike Maybe and Result, State is boxed. Four cases cannot be
discriminated by a primitive check on an unboxed value.

_Avoid_: Status, Loading, Idle, AsyncState, RemoteData.
