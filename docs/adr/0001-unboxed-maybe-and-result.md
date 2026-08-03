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
