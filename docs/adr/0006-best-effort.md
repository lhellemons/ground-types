# ADR-0006 — Best Effort: a boxed value with ordered diagnostics

Date: 2026-11-17. Status: accepted; implementation pending (the ticket
#117 surfaces).

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
in
`prototypes/117/consumer.ts`, with the measurements in
`prototypes/117/probe.test-d.ts` and `prototypes/117/probe.runtime.ts`.
The owner made the decisions below through the question tool; every
fact is pinned by a named probe.

## Decision

### The shape

`BestEffort<T, D>` is a frozen object with two members: `value: T` and
`diagnostics: readonly D[]`, in the order the diagnostics were gathered.
The module is functional, value-last and curryable where `/result` is
(ADR-0003); whether it gets a Box is #89's question (ADR-0005). Its
surface:

- `bestEffort(value, diagnostics = [])`: the constructor. `D` defaults
  to `never`, so a clean `bestEffort(1)` is `BestEffort<number, never>`
  and flows into any `BestEffort<number, D>` (probe "D defaults to
  never").
- `map(fn)`: transforms the value; the diagnostics ride along.
- `andThen(fn)`: chains a step that returns a Best Effort; the first
  step's diagnostics come before the second's, and the diagnostic types
  union to `D | D2` (probes "andThen keeps diagnostics in order",
  "andThen unions the diagnostic types").
- `note(diagnostics)`: appends diagnostics without touching the value
  (the Writer's tell).
- `gather(parts)`: fans a list of Best Efforts in, every value kept and
  every diagnostic in part order (probe "map keeps diagnostics, note
  appends, gather flattens"). It stops at nothing, so it is not the
  fan-in into a container that ADR-0001's "No `all`/`sequence`" bullet
  bans; #118 designs accumulation against it.
- `recover(result, fallback)` and `recover(result, fallback, diagnose)`:
  the bridge in. A Success is itself with no diagnostic; a Failure is
  `fallback` with the error as its one diagnostic, so `D` is `E`, or
  with `diagnose(error)` as the diagnostic, so `D` is what `diagnose`
  returns (probe "recover: a Success is itself"). The third parameter
  exists because the consumer's diagnostic is not the error: a dropped Piece
  is a drop record built from the error, the Piece and its Board.
- `toResult(toError)`: the bridge out, all or nothing. A Success of the
  value when the list is empty, else a Failure of
  `toError(diagnostics)` (probe "toResult: a Success when no diagnostic
  exists"). It does not know which diagnostics are tolerable: that
  filter is each consumer's, applied before the value becomes a Best
  Effort. No predicate overload.

### One list, `D` a union

A consumer with several kinds of diagnostic types `D` as their union and
projects. The consumer's `BestEffortWorld` exposes two arrays, `diagnostics`
(tagged `WorldFormatError`s) and `dropped` (`BestEffortDrop`s); on the
kit they are projections of one ordered list typed `WorldFormatError |
BestEffortDrop` (`partition` in `prototypes/117/consumer.ts`). A Piece
excluded after it parsed is one `kind: 'piece'` drop in the list and
appears in both projections, as the consumer has it (probe "a Piece on a taken
cell"); a dropped Link is a diagnostic, so `toResult` turns the Best
Effort into a Failure and never lets the drop out as a Success (probe "a
dangling Link"). The order across kinds is kept: document order for the
readers, then the retry loop's drops (probe "order"). The kit does not
carry a second channel.

### The guard sits on `toResult` only

`toResult` carries `success`'s `NotPossiblyAnError` guard on `T`,
because its Success arm is unboxed. Pinned refusals (probe "toResult
carries NotPossiblyAnError"): a `BestEffort<Error, D>`, a
`BestEffort<{ a?: number }, D>`, a `BestEffort<Record<string, number>,
D>`, and a `BestEffort<T, D>` with `T` an unresolved type parameter.
`BestEffort<World, D>` with `World` a class passes, as does
`BestEffort<Maybe<string>, D>` (probe "toResult of a Maybe part").
Generic code casts at the exit, as it does around `success`.

The constructor, `map` and `recover`'s fallback carry no guard: the box
keeps the value and the list apart, so `bestEffort(new Error('x'))` is a
`BestEffort<Error, never>` and `map` to an `Error` compiles (probe "the
constructor, map and recover carry no guard"). The unguarded alternative
(`toResultUnguarded` in the prototype, a cast as `orElse` and
`fromMaybe` make) was measured and not chosen.

### A three-state reader is a Best Effort of a Maybe

`BestEffort<Maybe<T>, D>` covers the consumer's `ReaderResult<T>` (ok, absent,
error): ok is a Just with no diagnostic, absent a Nothing with none,
error a Nothing with one, and it adds the state the consumer's wiring lints
need, a Just with a diagnostic over a kept value (`readOpenWhen` in
`prototypes/117/consumer.ts`; probes "a wiring lint", "BestEffort<Maybe<T>,
D> is a three-state reader"). `toResult` of it is `Result<Maybe<T>, E>`,
the reading ADR-0001's #65 amendment gives ok/absent/error. The library
names no reader type: the pattern is written out at each site. Its cost:
a generic reader cannot return `bestEffort(value)` as
`BestEffort<Maybe<T>, D>` without a cast, because `Maybe<T>` does not
reduce for an unresolved `T` (probe "a generic reader cannot return").

## Consequences

- The consumer's `parseWorldBestEffort` ports as `Result<BestEffort<World,
Diagnostic>, WorldFormatErrors>`: the pinned policy (an untagged shape
  error, a missing world id, an unattributable `World.from` rejection, an
  exhausted drop budget) stays the strict Failure, applied by the
  consumer before a Best Effort exists (probe "the pinned policy"). The
  retry loop is `note([drop], map(withoutEntry, current))` per drop;
  `recover` fits a part with a known fallback (a Piece to Nothing) and
  does not fit a diagnose-and-retry loop.
- The `format: world-v2` gate is one more diagnostic of the prelude. The
  port treats it as blocking (probe "the format gate"); the consumer
  reads past it, which its own test pins. That is a consumer choice, not
  a definition of `toResult`.
- `map`, `andThen` and `toResult` type their callback parameter from the
  value when the value argument is not itself a call with a
  context-sensitive callback: `map((x) => x, bestEffort(1))` types `x`
  as `number`. Nested, `map((x) => x, andThen((p) => …, be))` types the
  outer `x` as `unknown`, and the port annotates it in
  `validateBoardEntry` and `assemble` (probe "map types its callback
  parameter"). The curried `map(fn)` has no value to read `D` from, so
  `D` is `unknown` unless spelled by hand, as `/result`'s curried `map`
  spells `E` (probe "the curried map").
- A Failure re-wrapped into a differently typed Result retargets its
  phantom by hand, `failure<WorldFormatErrors, World>(strict)`, as the consumer
  writes today.
- The implementation ticket ships `bestEffort`, `map`, `andThen`, `note`,
  `gather`, `recover` (both overloads) and `toResult` at `/best-effort`,
  with the pins above as its tests, and leaves accumulation to #118 and
  a Box to #89.
