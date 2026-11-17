# ADR-0006 — Best Effort: a boxed value with ordered diagnostics

Date: 2026-11-17. Status: accepted.

## Context

ADR-0001's amendment of 2026-11-16 (#65) ruled a best-effort value in
scope as a module of its own, `BestEffort<T, D>` at `/best-effort`: a
value usable as it stands, together with the diagnostics gathered while
it was built. It recorded the rulings (boxed, diagnostics of any value,
a constructor, `map`, an order-keeping `andThen`, a bridge each way with
`Result`) and left the shape to a prototype. #117 built the kit in
`prototypes/117/best-effort.ts` and ported the best-effort parse of the
consumer that #65 measured (its `parseWorldBestEffort` and the
drop-a-piece, keep-the-board path of its `validateBoardEntry`) onto it
in `prototypes/117/consumer.ts`, with the measurements in
`prototypes/117/probe.test-d.ts` (types) and
`prototypes/117/probe.runtime.ts` (runtime). The owner made the
decisions below through the question tool. Each fact below names the
probe that pins it, by the opening words of that probe's title; a
sentence with no probe named is a decision, not a measurement. The
module itself ships from the implementation ticket this ADR surfaces.

## Decision

### The shape

`BestEffort<T, D>` is a structural type with two members: `value: T`
and `diagnostics: readonly D[]`, in the order the diagnostics were
gathered. A plain object literal with those members is a `BestEffort`
and is not frozen by being one; what the kit's functions return is
frozen one level deep, the box and its list, and the list is a copy of
what was passed (probes "a plain object literal is a BestEffort",
"bestEffort copies and freezes", and the "frozen" check in each
combinator probe). The module is functional, value-last and curryable by
arity as `/result`'s combinators are (ADR-0003), and its unapplied forms
are generic as `/result`'s `map(fn)` is: `T` and the box's `D` bind at
application, not at `map(fn)` (probes "an annotated callback types the
result in both forms", "note unions its D", "andThen unions the
diagnostic types", "toResult reads D from the value", "recover and
recoverWith", "the curried forms sit in pipe", "the curried forms run in
pipe"). Whether it gets a Box is #89's question (ADR-0005). Its surface:

- `bestEffort(value, diagnostics = [])`: the constructor. `D` defaults
  to `never`, so `bestEffort(1)` is `BestEffort<number, never>` and is
  assignable to `BestEffort<number, Diagnostic>` (probe "D defaults to
  never").
- `map(fn)`: transforms the value; the diagnostics ride along in order
  (probe "map keeps the diagnostics in order"). `fn` must not return a
  `BestEffort` (below).
- `andThen(fn)`: chains a step that returns a Best Effort; the first
  step's diagnostics come before the second's, each in its own order,
  duplicates kept, and the diagnostic types union to `D | D2` (probes
  "andThen: the first step's diagnostics", "andThen unions the
  diagnostic types").
- `note(diagnostics)`: appends `diagnostics` after the ones held, in its
  own order, duplicates kept, value unchanged (probe "note appends after
  the ones held").
- `gather(parts)`: fans a list of Best Efforts in: the values in part
  order, the diagnostics in part order and within a part, duplicates
  kept, an empty list giving an empty box (probe "gather: values in part
  order"). How accumulation relates to ADR-0001's "No `all`/`sequence`"
  bullet stays #118's question; `gather` is an input to it.
- `recover(fallback)` and `recoverWith(fallback, diagnose)`: the bridge
  in, two names because an optional `diagnose` would make currying by
  arity ambiguous (the owner's choice in review round 1, keeping the
  earlier decision that a diagnose step is optional). A Success is
  itself with no diagnostic, `success(undefined)` and `success(null)`
  included; a Failure is `fallback` with the error as the one diagnostic
  (`recover`, so `D` is `E`) or with `diagnose(error)` (`recoverWith`,
  so `D` is what `diagnose` returns), and `diagnose` is not called on a
  Success (probes "recover: a Success is itself", "recoverWith:
  diagnose(error) is the one diagnostic"). A throw from `diagnose`
  propagates unchanged, an `Error` or a plain string (the same probe).
- `toResult(toError)`: the bridge out, all or nothing. A Success of the
  value when the list is empty; else a Failure of `toError(list)`, handed
  the whole list in order, with `undefined`, `null`, `0`, `''` and
  `false` counted as diagnostics (probe "toResult: a Success of the
  value when the list is empty"). `toError` is not called on an empty
  list, and a throw from it propagates unchanged, an `Error` or a plain
  string (probe "toResult: a throw from toError propagates"). It has no
  predicate: the consumer decides which diagnostics block, on the list,
  before it calls `toResult`.

### One list, `D` a union

A consumer with several kinds of diagnostic types `D` as their union and
projects. The consumer's `BestEffortWorld` exposes two arrays,
`diagnostics` (tagged `WorldFormatError`s) and `dropped`
(`BestEffortDrop`s); on the kit they are projections of one ordered list
typed `WorldFormatError | BestEffortDrop` (`partition` in
`prototypes/117/consumer.ts`). A Piece excluded after it parsed is one
`kind: 'piece'` drop in the list and appears in both projections, as the
consumer has it (probe "a Piece on a taken cell"); a dropped Link is a
diagnostic, so `toResult` turns the Best Effort into a Failure and never
lets the drop out as a Success (probe "a dangling Link"). The order
across kinds is kept: the prelude's diagnostics, then document order for
the readers, then the retry loop's drops (probes "order", "the format
gate"). The kit carries no second channel.

### The guards sit on `toResult` and on `map`'s return

`toResult` carries `success`'s `NotPossiblyAnError` guard on `T`,
because its Success arm is unboxed. Pinned refusals (probe "toResult
carries NotPossiblyAnError"): a `BestEffort<Error, D>`, a
`BestEffort<{ a?: number }, D>`, a `BestEffort<Record<string, number>,
D>`, and a `BestEffort<T, D>` with `T` an unresolved type parameter.
`BestEffort<World, D>` with `World` a class passes, as does
`BestEffort<Maybe<string>, D>` (probe "toResult of a Maybe part").
Generic code casts at the exit, as it does around `success`.

A nested box would carry its diagnostics out as a Success: `toResult`
checks the outer list only. So `map`'s callback may not return a
`BestEffort`, through a `NotABestEffort` guard on its return type that
names `andThen` as the fix, and `toResult` refuses a `BestEffort`-valued
`T`. Pinned refusals (probe "a nested BestEffort is refused"): `map((x:
number) => bestEffort(x, ['lost']), bestEffort(1))`, a callback returning
`number | BestEffort<number, never>`, `toResult(toErrors,
bestEffort(bestEffort(1, ['lost'])))`, a `BestEffort<BestEffort<number,
string> | number, D>`, and the curried `toResult(toErrors)` applied to a
nested box.

The constructor, `map`'s input and the fallback of `recover` and
`recoverWith` carry no guard: the box keeps the value and the list
apart, so `bestEffort(new Error('x'))` is a `BestEffort<Error, never>`,
`map` to an `Error` compiles, and `recover` over a `Result<Error,
RangeError>` with an `Error` fallback compiles (probe "the constructor,
map and the recover fallback carry no guard"). The unguarded alternative
for the bridge out (`toResultUnguarded` in the prototype, a cast as
`orElse` and `fromMaybe` make) was measured (probe "toResultUnguarded
admits all of them") and not chosen.

### A three-state reader is a Best Effort of a Maybe

`BestEffort<Maybe<T>, D>` covers the consumer's three-state
`ReaderResult<T>` (ok, absent, error): ok is a Just with no diagnostic,
absent a Nothing with none, error a Nothing with one (probe "the
three-state reader"; `readOpenWhen` in `prototypes/117/consumer.ts`).
The consumer's own reader has only those three states and runs its
wiring lints later, on the built Board; the port models one lint at the
reader, as a tagged diagnostic over a kept value, to exercise the fourth
state the box has, a Just with a diagnostic (probe "a wiring lint
modelled at the reader"). `toResult` of it is `Result<Maybe<T>, E>`, the
reading ADR-0001's #65 amendment gives ok/absent/error (probe "toResult
of a Maybe part"). The library names no reader type: the pattern is
written out at each site. Its one measured cost: a generic reader with a
parameter `value: T | undefined` cannot return `bestEffort(value)` as
`BestEffort<Maybe<T>, D>`, because `Maybe<T>` does not reduce for an
unresolved `T`; `bestEffort(maybe(value))`, `bestEffort<Maybe<T>>
(just(value))` and a parameter typed `Maybe<T>` need no cast (probe "a
generic reader over `value: T | undefined`").

## Consequences

- The consumer's `parseWorldBestEffort` ports as `Result<BestEffort<World,
Diagnostic>, WorldFormatErrors>`: the pinned policy (an untagged shape
  error, a missing world id, an unattributable `World.from` rejection, an
  exhausted drop budget) stays the strict Failure. The consumer decides
  which diagnostics block, on the list, before it calls `toResult`
  (`blocking` in `prototypes/117/consumer.ts`; probe "the pinned
  policy"). The retry loop is `note([drop], map(withoutEntry, current))`
  per drop. `recoverWith` fits a part with a known fallback (a Piece to
  Nothing, with the drop as its diagnostic); the diagnose-and-retry loop
  is not a `recover`.
- The `format: world-v2` gate is one more diagnostic of the prelude,
  first in the list. The port treats it as blocking (probe "the format
  gate"); the consumer reads past it, which its own test pins. That is a
  consumer choice, not a definition of `toResult`.
- `map` and `andThen` infer their callback's parameter from the callback
  alone, as `/result`'s `map` does. Pinned instances where an
  un-annotated parameter is `unknown`: `map((x) => x, bestEffort(1))`,
  the same over a `note`, a `gather`, a `map` with an annotated callback,
  an `andThen` with an annotated callback, `andThen((x) => bestEffort(x),
bestEffort(1))`, and the curried `map((x) => x)(bestEffort(1))` (probe
  "an un-annotated callback parameter is unknown"). The port annotates
  every callback parameter. `toResult`'s applied form hands `toError` the
  value's `readonly D[]` without annotation (probe "toResult reads D
  from the value").
- `recover(undefined, result)` over a `Result<World, E>` infers
  `BestEffort<World | undefined, E>`, and `recoverWith` the same; the
  unapplied `recover(undefined)` binds `T` to `undefined` and refuses
  that result, so the curried form over a Maybe is written
  `recover<Maybe<World>>(undefined)` (probe "recover with an undefined
  fallback"). The curried `map((x: number) => …)` refuses a box whose
  `T` does not fit the callback (probe "an annotated callback types the
  result in both forms").
- A Failure re-wrapped into a differently typed Result retargets its
  phantom by hand, `failure<WorldFormatErrors, World>(strict)`, as the
  consumer writes today (`parseWorld` in `prototypes/117/consumer.ts`).
- The implementation ticket ships `bestEffort`, `map`, `andThen`, `note`,
  `gather`, `recover`, `recoverWith` and `toResult` at `/best-effort`,
  with the probes above as its tests, and leaves accumulation to #118 and
  a Box to #89.
