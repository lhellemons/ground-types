# ADR-0003 — Currying decided by arity, adopted incrementally

Date: 2026-08-03. Status: accepted.

## Context

The modules imported from another project (`promise`, `call`, and the
`mapper` package now merged into `fn`) offer a dual calling shape:
`resultify(mapRejection)` returns a mapper, and
`resultify(mapRejection, promise)` applies it, selected by overloads over
a shared `curry` helper.

The modules already published here do not. `maybe/map`, `result/andThen`,
`orElse`, `fallback` and the rest take their configuration and return a
unary function, always — v0.2.0 shipped that matched combinator set as
its headline.

So the library had two calling conventions, split along a line no
consumer could predict.

Worse, the imported `curry` decided which shape it was in by inspecting
its argument:

```ts
return input !== undefined ? mapper(input as T) : mapper
```

In this library `Nothing` **is** `undefined`. A curryable function whose
input is a `Maybe` would therefore return the mapper unapplied whenever
the value was absent — silently, with no type error at the call site.
That is not an edge case here; it is a collision with the encoding
ADR-0001 is about.

There is a second trap one level up. Every caller ended in
`curry(mapper, optionalParam)`, which passes two arguments whether or not
the caller supplied one. `curry` therefore observed arity 2 always, so
fixing `curry` alone would have fixed nothing.

## Decision

- **Currying is decided by arity, never by value.** `curry` takes its
  input as a `[] | [T]` rest tuple and branches on `input.length`. An
  explicit `undefined` is an argument, and is applied.

- **Callers forward their own arity.** Every curryable export takes a
  rest tuple of its own and spreads it into `curry`. This is the part
  that actually closes the hole, and it is why `pipe`,
  `promise/resultify` and `call/resultify` all changed rather than just
  `curry`. `call/resultify` additionally stopped hand-rolling its own
  `!== undefined` test.

- **Public overloads are unchanged.** Only implementation signatures
  move, so no call site had to change.

- **Currying is adopted in the new modules only, for now.** `maybe` and
  `result` keep their published config-to-unary-function signatures. The
  intent is to retrofit currying across them so the whole library reads
  one way; that is a deliberate, separate change to ten documented
  exports and does not belong smuggled into a port.

- **`CurryableMapper<T, U> = Mapper<T, U> | U` is an implementation
  signature, not a call-site type.** When `U` is itself a function — as
  it is for `call/resultify`, whose `U` is a `Call` — the two branches
  are indistinguishable to both the compiler and the reader. Callers see
  one branch or the other through the overloads; nothing should try to
  narrow the union.

## Consequences

- Currying is safe to use with `Maybe`-valued inputs, which was the
  blocker. A test pins that `curry(mapper, undefined)` applies the mapper
  rather than withholding it, and the same for `pipe`.
- The library temporarily reads two ways: `promise/resultify(fail,
promise)` is curryable, `result/map(fn)(value)` is not. This is known
  and tracked here rather than discovered later.
- Retrofitting `maybe` and `result` will cost two overload signatures
  plus an implementation signature per export, and will need watching for
  inference regressions — TypeScript commits to the first matching
  overload without backtracking, and both modules lean on defaulted type
  parameters (`E extends Error = Error`).
- `fn` is now the single home for function vocabulary. The `mapper`
  package's `compose` was left-to-right where `fn`'s is right-to-left; it
  was renamed `pipe` rather than shipped under a name that already meant
  the opposite, since the failure mode of getting that wrong is silently
  applying transformations backwards.

**Update, ADR-0004:** `pipe`'s shape described above (function-first,
2-ary, curryable) was reversed to value-first and N-ary the same day, to
actually serve chained `maybe`/`result` combinators — see
[docs/adr/0004-pipe-value-first.md](./0004-pipe-value-first.md). `pipe`
no longer has a deferred form, so the curry-arity trap this ADR fixed no
longer applies to it specifically; `curry` and `CurryableMapper`
themselves, and their use in `promise/resultify`/`call/resultify`, are
unchanged.

**Update, 2026-08-04:** the retrofit this ADR deferred has landed. Every
config-taking combinator in `maybe` (`map`, `andThen`, `orElse`,
`fallback`) and `result` (`map`, `andThen`, `orElse`, `fallback`,
`fromMaybe`) now offers the dual calling shape, via the same
applied-form-first overload pair over `curry` with a `[] | [T]` rest
tuple, so the whole library reads one way. Two things the retrofit
surfaced, both anticipated above as "will need watching for inference
regressions":

- `result/map` and `result/andThen`'s unapplied forms return _generic_
  functions — `T` and `E` bind at application, not at `map(fn)`. The
  applied overloads bind them from the supplied value instead, and
  type-level tests pin that neither form lost inference quality.
- Inference into `Maybe<T>`'s conditional collapses when the argument is
  statically `Nothing` (plain `undefined`), so the applied forms over a
  `Maybe` spell their value parameter `T | undefined` — the same type for
  any admissible `T`, and the same spelling `maybe()` itself uses at the
  boundary.
