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
  would create a real runtime import cycle. `grep -n "^import"
dist/maybe/index.js dist/result/index.js` after building must show
  neither module importing the other; this is checked, not assumed.

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
  imports of each other, verified after every build.

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
`failure<T, E>(...)` / `result<T, E>(...)` annotation when constructing a
`Result` typed to an error class narrower than the constructor's own
inference would produce.
