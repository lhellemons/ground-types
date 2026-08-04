# ADR-0004 — `pipe` redesigned: value-first, N-ary, always immediate

Date: 2026-08-04. Status: accepted.

## Context

Every combinator in `/maybe` and `/result` takes its configuration and
returns a unary function — `map(fn)`, `andThen(fn)`, `orElse(v)`. That
shape only pays off with something to run a value through a sequence of
them, and until now there wasn't one: real code chaining more than one
step had to nest, reading inside-out and in the opposite order from how
the data flows —

```ts
orElse(0)(andThen(validate)(map(double)(maybe(x))))
```

(GitHub issue #7.)

`fn/pipe`, added the same day this issue was filed (see
[docs/adr/0003-currying.md](./0003-currying.md)), doesn't fill the gap.
It came from folding an imported `mapper` package into `fn`, not from
working this issue, and it is:

- **Fixed at exactly two steps** — `pipe<X,Y,Z>(xToY, yToZ)`. A chain of
  three or more still nests: `pipe(pipe(f1, f2), f3)`.
- **Function-first, value optional and last** — `pipe(f1, f2, x?)`,
  curryable per ADR-0003: two arguments builds a reusable `Mapper`, three
  applies immediately.

The curryable, value-last shape was measured against a bare, unannotated
inline function (`pipe((n) => n + 1, (n) => n.toString())`, applied
later): it fails outright, `n` is `unknown`. There is nothing in that
call for TypeScript to anchor inference on — no concrete, non-function
argument is present, and TypeScript does not retroactively re-infer a
generic call once it has already resolved. The same shape with the value
supplied immediately (`pipe(f1, f2, x)`) does infer the bare functions
correctly: TypeScript's two-pass argument checking uses the concrete `x`
to fix the chain's type parameters before it needs to contextually type
the function arguments, regardless of `x`'s position in the argument
list. This was verified by emitting declarations for both forms, not
assumed.

That is the deciding fact: **inference needs a concrete value in the
same call, not a particular argument order.** Issue #7 asks for the
value first anyway, matching how the combinator chain itself reads
("start with the value, then transform"), so value-first was chosen —
but the underlying requirement driving the redesign is "always apply
immediately," not the exact position of `value`.

## Decision

- **`pipe` is redesigned in place**, reversing the shape ADR-0003
  shipped hours earlier:
  ```ts
  pipe<A, B, C, ...>(value: A, f1: Mapper<A, B>, f2: Mapper<B, C>, ...): last
  ```
  Value first, always applied immediately.
- **No deferred form.** The old `pipe(f1, f2)` (no value, returns a
  `Mapper`) is removed. It cannot infer a bare unannotated step even in
  principle (nothing anchors it), and reusable point-free composition
  already has a home in `compose` (right-to-left, unchanged).
- **Typed up to ten steps**, each an explicit overload naming its own
  chain of type parameters, so every step's parameter type is pinned to
  the previous step's return type — not inferred loosely, not widened.
  A step that doesn't fit its neighbour is a compile error at that exact
  step. Verified: a deliberately mismatched step (`toNumber` returning
  `number` into a step expecting `boolean`) is rejected with `Type
'number' is not assignable to type 'boolean'`, pointing at the wrong
  function.
- **An eleventh step is a hard compile error, not a silent `unknown`
  fallback.** `Expected 2-11 arguments, but got 12.` The untyped
  implementation signature is not independently callable once overloads
  exist, so overflowing the cap fails loud by construction — no explicit
  guard needed, and none was added.
- **This sidesteps ADR-0003's curry-arity trap entirely, for `pipe`
  specifically.** `value` is now `pipe`'s mandatory first parameter, not
  an optional trailing one selected by a rest tuple — there is no "was an
  argument passed?" question left for `pipe` to get wrong against a
  `Maybe` whose absent case is `undefined`. `curry` and
  `CurryableMapper` are unchanged and still back `promise/resultify` and
  `call/resultify`, where the trap they guard against still applies.
- **The 7-step chain mixing `maybe` and `result`** — `maybe → map →
andThen → fromMaybe (bridge) → map → andThen → orElse` — was run
  through `pipe` and its declaration emitted: it infers the exact
  correct type end to end (`Success<string, Error | TooShort>`), with no
  degradation from the `ValueOf`/`ErrorOf` phantom-based inference fix
  (see docs/adr/0001-unboxed-maybe-and-result.md). This chain is now
  pinned as a type-level test in `src/fn/index.test-d.ts`.

## Consequences

- `pipe(f1, f2)` (deferred, no value) no longer compiles; every call
  site must supply a value as the first argument. There were no internal
  consumers of the old shape to migrate.
- `CONTEXT.md`'s Mapper entry is updated: **pipe** now reads "apply a
  value through a sequence of Mappers, left to right, immediately,"
  rather than describing a curryable `Mapper`-producing form.
- A chain longer than ten steps is a compile error naming the argument
  count, not a type. Splitting it into two `pipe` calls is the
  documented way out; no untyped escape hatch was added on purpose (see
  Decision).
- `fn/index.ts` keeps `compose` unchanged, for the point-free case `pipe`
  structurally cannot serve.
- **`pipe` cannot take a dynamically-built array of steps.**
  `pipe(value, ...steps)` for a `steps: Mapper<unknown, unknown>[]` is a
  compile error (`A spread argument must either have a tuple type or be
passed to a rest parameter`), because the explicit per-arity overloads
  this ADR chose are what make each step's type checked against its
  neighbour — a rest parameter could accept the spread but could not
  express that chaining constraint. `pipe` is for a fixed, explicit
  sequence of steps written at the call site; a runtime-assembled
  pipeline needs `Array.prototype.reduce` directly, untyped step-to-step.
- **`pipe(value)` alone, with no steps, does not compile** — deliberately:
  there is no overload for it. A value with nothing to pipe it through
  doesn't need `pipe`; pinned by a type-level test in
  `src/fn/index.test-d.ts`.
