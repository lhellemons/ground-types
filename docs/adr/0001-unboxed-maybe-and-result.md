# ADR-0001 — Unboxed Maybe and Result

Date: 2026-08-03. Status: accepted.

## Context

`Maybe<T>` and `Result<T, E>` are both encoded unboxed: a `Just<T>` _is_
the `T`, a `Success<T>` _is_ the `T`, and a `Failure` _is_ the `E`.
Discrimination is a primitive check — `=== undefined` for Maybe,
`instanceof Error` for Result — with no wrapper object ever allocated.
This rationale previously lived only in the consuming project's own
ADR-0016, which does not travel with this library now that it has been
extracted; this ADR records it here as the library's own ground truth.

Two consequences fall out of the encoding, established by probing the
compiler rather than assumed:

- `Maybe<Maybe<T>>` and `Maybe<T>` are mutually assignable — nesting a
  Maybe inside a Maybe is not merely discouraged, it is unrepresentable.
  A `Maybe<U>`-returning callback run through `map` cannot produce an
  observable `Maybe<Maybe<U>>`; it collapses to `Maybe<U>`.
- `Result<Result<T>>` **is** a distinct type, and it is **not**
  assignable back to `Result<T>`. Once a Result nests, it is stuck —
  there is no generic way to un-nest it back to the outer shape.

## Decision

- **Keep both Maybe and Result unboxed.** It makes both types nearly
  free to pass across a boundary, and a value that is already a `T`
  needs no unwrapping at the point of use.
- **No `all`/`sequence`.** Generic fan-in combinators need a real
  container to accumulate into, and casts to move between that
  container and the unboxed representation would erode the static
  guarantee that a `Success` can never be an `Error`. Fan-in
  constructors are expected to use `tryCatch` over throwing code
  instead, not a Maybe/Result combinator kit.
- **No Maybe analogue of `tryCatch`.** `tryCatch` exists to lift a
  _throwing_ function into a `Result`. A `Maybe`-producing operation
  doesn't throw to signal absence — it returns `undefined`, which is
  already the `Maybe` encoding directly. There is nothing left for a
  Maybe `tryCatch` to lift.
- **`andThen` over `flatMap`, because nothing ever flattens.** The
  original name (`flatMap`, paired with an explicit `flatten`) implied a
  real flattening step. Since `Maybe<Maybe<T>>` **is** `Maybe<T>`,
  `flatten` was provably an identity function and was deleted, and the
  chaining combinator was renamed `andThen` — both to read as "and then
  do this fallible step" and to match `result/andThen`'s name, even
  though the two are not the same kind of function underneath:
  - **`maybe/andThen` is a true alias of `maybe/map`** — the same
    function, in types and at runtime. It exists purely for symmetry
    with `result/andThen`, so generic code written against both modules
    can call `andThen` without caring which one it's holding.
  - **`result/andThen` is _not_ an alias of `result/map`.** Because
    `Result<Result<T>>` is a distinct, stuck type, running a
    `Result`-returning callback through `map` is a trap: it produces a
    real nested value with no way back. `andThen` exists specifically to
    prevent that — `fn` returns a `Result` directly, and `andThen`
    short-circuits before ever calling it if the input already failed.
- **`orElse` eager, `fallback` lazy — in both modules.** Both modules
  offer the same pair: `orElse(defaultValue)` substitutes a precomputed
  default; `fallback(fn)` computes the default lazily, only when the
  input is absent or failed. Same naming and the same eagerness
  convention in both, so a reader who knows one module's combinator set
  already knows the other's.
- **A bridge in each direction, kept free of a runtime cycle.**
  `maybe/fromResult` discards the error to turn a `Result` into a
  `Maybe`; `result/fromMaybe` takes an error to turn a `Maybe` into a
  `Result`. The two modules import each other's _types_ only (`import
type`, erased entirely at emit by `verbatimModuleSyntax`), and each
  bridge's runtime check is an inlined primitive (`value instanceof
Error`, `value === undefined`) rather than a call to the other module's
  `isSuccess`/`isNothing` guard — calling those across the boundary
  would create a real runtime import cycle. This is maintained by
  convention, not enforced: nothing in `pnpm check` or CI builds and
  inspects the emitted output, so a contributor who "tidies" a bridge by
  importing the other module's guard as a value would create the cycle
  silently, with every existing check still passing. Both bridge
  functions carry an inline comment saying so, next to the check itself.

## Consequences

- The unboxed encoding stays load-bearing and un-fought: no
  `all`/`sequence`/`traverseMaybe` primitives, now or for as long as the
  encoding holds.
- `maybe` and `result` present a matching combinator surface
  (`map`/`andThen`, `orElse`/`fallback`, and a bridge each way) without
  actually sharing an implementation underneath — the asymmetry between
  `maybe/andThen` (an alias) and `result/andThen` (a distinct function)
  is a documented trap, not an oversight, and both docblocks say so
  explicitly.
- `dist/maybe/index.js` and `dist/result/index.js` stay free of runtime
  imports of each other, by convention rather than an automated gate:
  each bridge's inlined runtime check is what keeps it that way, not a
  build step that verifies it. Confirming it means building and running
  `grep -n "^import" dist/maybe/index.js dist/result/index.js` by hand.

## Amendments

### 2026-08-04 — `Success`'s error phantom is invariant in `E`; accepted as a known sharp edge (#17)

`Success<T, E>` carries `readonly [_phantom]?: E` purely to give `E` a
position in the type — `Success` never holds an `Error` value, so nothing
else in its shape mentions `E` at all. That phantom makes `Success`
(and therefore `Result`) invariant in `E`: a `Success<T, Error>` is not
assignable to `Success<T, Invalid>` even when `Invalid extends Error`, so
code that constructs a `Result` at a call site typed to a narrower error
class has to spell it out:

```ts
class Invalid extends Error {
  readonly code = 'invalid' as const
}

const step: (n: number) => Result<number, Invalid> = (n) => success(n * 2)
// Type 'Success<number, Error>' is not assignable to type 'Result<number, Invalid>'.
//   Types of property '[_phantom]' are incompatible.

const step: (n: number) => Result<number, Invalid> = (n) =>
  success<number, Invalid>(n * 2) // works
```

(An `Invalid` with no added members doesn't trigger this — TypeScript
treats it as structurally identical to `Error`. It takes a distinguishing
field, which is the common case for a real domain error.)

**This is not unsound.** The same invariance that produces the annotation
burden also rejects a plain `Error` masquerading as `Invalid`, which is the
property the phantom exists to enforce — confirmed by probing the compiler
directly rather than assumed.

**Decision: keep the phantom, accept the annotation as a sharp edge.**
Two things were checked, not assumed, before settling this:

- The annotation is now rare. It used to be the workaround for `andThen`
  collapsing chained inference to `unknown`; that was fixed separately, so
  ordinary `map`/`andThen` chains infer the narrower error type on their
  own. The phantom only bites when a `Result`/`Success`/`Failure` is
  constructed directly at a site typed to an error class narrower than the
  constructor call's own default.
- Dropping the phantom does not buy as much as it looks like. Measured by
  editing a copy of `Success`'s definition, emitting declarations, and
  running the full test suite against it: `Success<Result<T, E>, E>` does
  become mutually assignable with `Success<T, E>` — a real, if narrow,
  collapse — but `Failure` carries its own separate `[_phantom]?: T`
  marker, so the ADR's core invariant (`Result<Result<T>>` is not
  assignable back to `Result<T>`) survives untouched, and every existing
  type-level test — including the one encoding `map`'s nesting trap — stays
  green. `andThen`'s distinctness from `map` doesn't depend on this
  phantom either; that guard runs through `NotAResult`, `ValueOf`, and
  `ErrorOf`, none of which read `Success`'s `E` phantom. On top of that,
  removing the field leaves `E` unused in `Success`'s definition, which
  fails this repo's `noUnusedLocals` — not the clean one-line deletion it
  looks like.

So the fix would touch real type-checking behavior for a case the codebase
rarely hits anymore, in exchange for a partial, narrow relaxation. Not
worth it before 1.0. No code changes as a result of this amendment — call
sites that hit this still need an explicit `success<T, E>(...)` /
`failure<E, T>(...)` / `result<T, E>(...)` annotation when constructing a
`Result` typed to an error class narrower than the constructor's own
inference would produce. (`failure` binds the error first — its parameter
order was deliberately reversed from the other two; see the constructor
docblocks.)

### 2026-11-14 — The #17 amendment is reversed: the constructors drop their top-type defaults (#57)

The 2026-08-04 amendment kept the annotation burden on the grounds that
the annotation was rare and that the phantom's invariance was its cause.
A consumer feedback round (#56) found neither to hold. Consumers do not
chain with `map`/`andThen`; they write early returns, and that is where
the cost lands: zinbow carries 261 `failure<E, T>(…)` and 127
`success<T, E>(…)` sites, 92 of them re-wrapping an already-narrowed
failure only to change its phantom `T`, and has made the annotation a
project rule. over-and-out has the same pattern. slider avoids it by
never narrowing `E`, so its typed errors go unused.

A probe (`prototypes/57/`, measured on TypeScript 5.9.3, 6.0.3 and 7.0.2)
corrects the diagnosis. The phantom was never invariant: `readonly
[_phantom]?: E` is covariant, so a `Success<number, Invalid>` is
assignable to a `Success<number, Error>` and only the narrowing direction
is rejected. The cost comes from the constructors' top-type defaults,
`E = Error` on `success` and `T = unknown` on `failure`, meeting that
covariant phantom: every call without type arguments takes the default,
and a `Success<number, Error>` cannot narrow into a `Result<number,
Invalid>`, so the caller has to say `Invalid` by hand. A `Success`
carries no error, so its honest error type is `never`, and `Success<T,
never>` is assignable to every `Result<T, E>`; likewise a `Failure`
carries no value. With `never` defaults and `NoInfer` on the phantom
position, the phantom stays, stays covariant, and stops costing anything
in the cases consumers actually write:

```ts
success<T, E extends Error = never>(value: T): Success<T, NoInfer<E>>
failure<E extends Error, T = never>(error: E): Failure<NoInfer<T>, E>
```

`result` has a different shape of cost: a union argument lands wholly in
`T` and `E` defaults to `Error`. It gains a first overload that splits
the argument, keeping the two-parameter signature for explicit calls:

```ts
type ErrorArmOf<V> = unknown extends V
  ? Error
  : V extends Error
    ? V
    : Error extends V
      ? Error
      : never

result<V>(value: V): Result<Exclude<V, Error>, ErrorArmOf<V>>
```

`ErrorArmOf` is load-bearing. A plain `Extract<V, Error>` is `never` for
every type a plain `Error` is assignable to without being one: `unknown`,
`object`, `{}`, `{ message: string }`, and the narrowed `catch` binding
`typeof e === 'object' && e !== null`. That would collapse `result(e)` to
its `Success` arm and let a caught plain `Error` pass where `Invalid` is
required. `ErrorArmOf` keeps each `Error` member of `V` as itself and
answers `Error` for a member that merely admits one, so `result(o)` with
`o: object` is `Result<object, Error>` as on the old signature,
`result(u)` with `u: number | Invalid | Other` is `Result<number, Invalid
| Other>`, and `result(new Error())` is `Failure<never, Error>`.

`NoInfer` needs TypeScript 5.4 or later. `src/` uses nothing newer than
that today and the package declares no TypeScript range, so the
implementation's CHANGELOG entry states the floor.

The Result Box's `from` takes the same overload, so the parity between
`from` and `result()` that the Box tests pin survives. That breaks a
different promise: `box`'s docblock says a raw non-Result value "degrades
to exactly `from`'s behaviour", and with the overload `Result.from(raw)`
is `Result<T, never>` where `Result.box(raw)` is `Result<T, Error>`.
Which of the two promises `box` keeps is not decided here; it goes to the
implementation task and to the Box implementation (#66), under
docs/adr/0005-box-classes.md.

Under these signatures, with no type arguments, all of the following
compile (each is a probe in `prototypes/57/probe.test-d.ts`): `(n): Result<number, Invalid> => success(n)`, `(): Result<number,
Invalid | Other> => failure(new Invalid())`, `(x: number | Invalid):
Result<number, Invalid> => result(x)`, and `if (isFailure(r)) return
failure(r)` into a `Result` with a different `T`. Both guarantees hold,
checked rather than assumed: a plain `Error` is still rejected where
`Invalid` is expected, through `failure`, through `result` of a union, of
an `unknown` value and of an `object` or narrowed `catch` binding, and
through a bare `Failure<_, Error>`; and
`Result<Result<T>>` is still not assignable to `Result<T>`. Every existing type-level test stays green but two, whose
expectations change from `Success<number, Error>` to `Success<number,
never>` and from `Failure<unknown, Invalid>` to `Failure<never, Invalid>`,
plus the Box `from` expectations the overload moves.

**Decision: reverse the 2026-08-04 amendment.** The phantom is kept, and
the annotation is no longer accepted as a sharp edge: the constructors
will take the signatures above, in the implementation task that follows
this amendment. Explicit type arguments remain allowed, so consumer code
that still writes them keeps compiling.

Two things were ruled out on the way:

- **Returning a narrowed failure as-is** (`if (isFailure(r)) return r`
  into a `Result` with a different `T`) is not achievable. Narrowing
  `isFailure` to `Failure<never, E>` (`prototypes/57/arm-b1.patch`)
  breaks its false branch, because TypeScript removes only constituents
  that are subtypes of the narrowed type and `Failure<T, E>` is not one.
  Dropping `Failure`'s `[_phantom]?: T` (`arm-b.patch`) makes
  `Result<Result<T>>` assignable to `Result<T>`: `Success`'s
  `[_value]?: T` handle cannot hold the invariant alone, since
  `Success<Result<T>>` intersects the inner `Success<T>`'s handle and an
  intersection is assignable to either side. The invariant is held by
  `Failure`'s phantom `T` and nothing else, so that phantom stays. The
  same site is `return failure(r)`, which needs no type arguments.
- **`definePrimitiveValueObject` inferring `E` from `errorHandler`** was
  never blocked by the phantom. `definePrimitiveValueObject<Email>(…)`
  names `T`, and TypeScript never infers the type parameters a partial
  list leaves out; they take their defaults. With no type arguments at
  all, `T`, `P` and `E` all infer, on the old signatures as well. The
  docblock's diagnosis is corrected by the implementation of this
  amendment.
