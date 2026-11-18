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
decisions below through the question tool. A probe is cited by the
opening words of its title. The module itself ships from the
implementation ticket this ADR surfaces.

## Decision

### The shape

`BestEffort<T, D>` is a structural type with two members: `value: T`
and `diagnostics: readonly D[]`, in the order the diagnostics were
gathered. A plain object literal with those members is a `BestEffort`
and `toResult` reads it (probe "a plain object literal is a
BestEffort"). In a box the kit's functions return, the box and its list
are frozen, and the list is a copy of what was passed; the value and
each diagnostic are not frozen by the box, and `gather`'s value array is
not frozen (probes "bestEffort copies and freezes", "frozen one level
deep", "gather: values in part order", and the "frozen" checks in the
probes of `map`, `andThen`, `note`, `gather`, `recover` and
`recoverWith`, applied and curried, both arms of the two bridges in, and
`andThen` over a clean first box whose callback returns an unfrozen
literal). The module is functional, value-last and curryable by arity as
`/result`'s combinators are (ADR-0003). The unapplied `map`, `note` and
`andThen` bind `T` and the box's `D` at application, as `/result`'s
`map(fn)` does (probes "an annotated callback types the result in both
forms", "note unions its D", "andThen unions the diagnostic types", "the
curried forms sit in pipe", "the curried forms run in pipe"). The
unapplied `toResult(toError)` binds `D` and `E` at the call, from
`toError`, and `T` at application: `toResult((d) => new
Error(String(d.length)))` is a `<T …>(value: BestEffort<T, unknown>) =>
Result<T, Error>` with `d` a `readonly unknown[]`, and one whose
`toError` takes a `readonly string[]` refuses a `BestEffort<number,
number>`; in `pipe`, an un-annotated `toError`'s `D` is inferred from the
piped box (probe "toResult reads D from the value"). `recover(fallback)`
binds `T` at the call and `E` at application, where `/result`'s
`orElse(defaultValue)` binds both at the call; `recoverWith(fallback,
diagnose)` binds `T`, `E` and `D` at the call, so `recoverWith(0, (e) =>
e.code)(r)` over a `Result<number, Coded>` does not compile standalone,
with `code` not on `Error` (probe "recover and recoverWith"). Whether
the module gets a Box is #89's question (ADR-0005). Its surface:

- `bestEffort(value, diagnostics = [])`: the constructor. `D` defaults
  to `never`, so `bestEffort(1)` is `BestEffort<number, never>` and is
  assignable to `BestEffort<number, Diagnostic>` (probe "D defaults to
  never").
- `map(fn)`: transforms the value; the diagnostics ride along in order
  (probe "map keeps the diagnostics in order"). `fn` must not return a
  `BestEffort` (below).
- `andThen(fn)`: chains a step that returns a Best Effort; the first
  step's diagnostics come before the second's, each in its own order,
  duplicates kept within and across the steps, and the diagnostic types
  union to `D | D2` (probes
  "andThen: the first step's diagnostics", "andThen unions the
  diagnostic types").
- `note(diagnostics)`: appends `diagnostics` after the ones held, in its
  own order, duplicates kept within the added list and against the held
  one, value unchanged, the caller's array
  untouched (probe "note appends after the ones held").
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
  Success, and `recover` stores the error itself where `recoverWith`
  hands `diagnose` the error itself and stores what `diagnose` returns
  by identity (probes "recover: a Success is itself", "recoverWith:
  diagnose(error) is the one diagnostic"). A throw from `diagnose`
  propagates by identity, a `TypeError` or a plain string, applied and
  curried (probe "recoverWith: diagnose(error) is the one diagnostic").
  A throw from `map`'s or `andThen`'s callback propagates by identity
  the same way, a `TypeError` or a plain string, applied and curried
  (probes "map keeps the diagnostics in order", "andThen: the first
  step's diagnostics").
- `toResult(toError)`: the bridge out, all or nothing. A Success of the
  value when the list is empty; else a Failure of `toError(list)`, handed
  the whole list in order, with `undefined`, `null`, `0`, `''` and
  `false` counted as diagnostics (probe "toResult: a Success of the
  value when the list is empty"). `toError` receives the box's own list
  and its return is handed back as is (probe "toResult hands toError the
  box's own list"). `toError` is not called on an empty list, and a throw
  from it propagates by identity, a `TypeError` or a plain string,
  applied and curried (probe "toResult: a throw from toError
  propagates"). `toResult` has no predicate: any diagnostic makes it a
  Failure. Which diagnostics block is the consumer's decision, made on
  the list itself; the port's `parseWorldBestEffort` tests the list with
  `blocking` and returns either the strict Failure or the Best Effort
  (probe "the pinned policy").

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
across kinds is kept: the prelude's diagnostics (the `format` gate ahead
of a reader's lint), then document order across boards, and within a
board the piece readers' diagnostics, then the occupancy drops, each in
document order, then the retry loop's drops (probes "order", "the format
gate"). The kit carries no
second channel.

### The guards sit on `toResult` and on `map`'s return

`toResult` carries `success`'s `NotPossiblyAnError` guard on `T`,
because its Success arm is unboxed. Pinned refusals (probe "toResult
carries NotPossiblyAnError"): a `BestEffort<Error, D>`, a
`BestEffort<{ a?: number }, D>`, a `BestEffort<Record<string, number>,
D>`, and a `BestEffort<T, D>` with `T` an unresolved type parameter.
`BestEffort<World, D>` with `World` a class passes, as does
`BestEffort<Maybe<string>, D>` (probe "toResult of a Maybe part").
Generic code casts at the exit, as it does around `success`. `T` must
pass both guards together, this one and `NotABestEffort` below: a `T` of
`any` passes each alone and is refused by `toResult`, applied and
curried, with a `never` message that names no fix, where `map`'s guard
passes `any` (probe "toResult refuses a T of any"). The refusal is kept
as it stands and the amendment of 2026-11-18 (#127) pins it.

A nested box would carry its diagnostics out as a Success: `toResult`
checks the outer list only. So `map`'s callback may not return a
`BestEffort`, through a `NotABestEffort` guard on its return type whose
message names `andThen` as the fix (pinned in probe "a look-alike is
refused"), and `toResult` refuses a `BestEffort`-valued `T`. The guard
refuses a value type with a Best Effort among its top-level union arms.
Pinned refusals (probe "a nested BestEffort is refused"): `map((x:
number) => bestEffort(x, ['lost']), bestEffort(1))`, a callback returning
`number | BestEffort<number, never>`, `toResult(toErrors,
bestEffort(bestEffort(1, ['lost'])))`, a `BestEffort<BestEffort<number,
string> | number, D>`, and the curried `toResult(toErrors)` applied to a
nested box, a `BestEffort<Maybe<BestEffort<…>>, D>` and a
`BestEffort<BestEffort<…> | BestEffort<…>[], D>` (probe "a nested
BestEffort is refused"); the unapplied `toResult(toErrors)` and
`map(fn)` carry the same guards (probe "the curried forms carry the
guards"). A Best Effort inside an array, inside a `readonly
[BestEffort<…>]` tuple, inside an object property, inside a `Promise`
(where `/result`'s `NotAResult` refuses a thenable), and the nested
boxes of a `gather` over boxed boxes are not refused and leave
`toResult` inside the Success, diagnostics and all; a declared type the
box is assignable to, with no top-level arm assignable to
`BestEffort<unknown, unknown>`, such as `{ readonly value: number }` or
`{ value?: number; diagnostics: readonly string[] }` as a `map`
callback's declared return, is not refused by `NotABestEffort`; where
`NotPossiblyAnError` also passes it, the box leaves `toResult` inside the
Success as that type, diagnostics and all (probe "a Best Effort inside a
container is not refused", and at runtime "a box inside a container
leaves toResult inside the Success"). The guard is structural, as the
type has it: an arm assignable to `BestEffort<unknown, unknown>`, so one
with a public required `value` and a public required `diagnostics` that
`readonly unknown[]` accepts, a `diagnostics` typed `any` included, is
refused by `map` and by `toResult` as a Best Effort, an object with one
more member and a `{ value: number; diagnostics: any }` among the pinned
instances; a class with a `private readonly value` and a public
`diagnostics` array is not refused, and neither is a class with a public
`value` and a `private readonly diagnostics` (probe "a class with a private
diagnostics and a public value is not refused by map or toResult"); `any`
as `map`'s return passes `map`'s guard although `any` is assignable to
`BestEffort<unknown, unknown>` (probe "any passes the guard of map
although any is assignable to BestEffort<unknown, unknown>"); and a generic `map(f, be)` with `f:
(n: number) => V` is refused, as `/result`'s `map` refuses `mapResult(f,
r)` with the same `f` (probe "a look-alike is refused").

The constructor, `map`'s return and the fallback of `recover` and
`recoverWith` admit an `Error`: the box keeps the value and the list
apart, so `bestEffort(new Error('x'))` is a `BestEffort<Error, never>`,
`map` to an `Error` compiles, and `recover` and `recoverWith` over a
`Result<Error, RangeError>` with an `Error` fallback compile (probe "the
constructor, map's return and the fallback of recover and recoverWith
admit an Error"). The unguarded alternative
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
  failure, a missing world id, an unattributable `World.from` rejection, an
  exhausted drop budget) stays the strict Failure: `parseWorldBestEffort`
  tests the list with `blocking` and returns either the strict Failure
  or the Best Effort, which never goes through `toResult` (probe "the
  pinned policy"). The retry loop is `note([drop], map(withoutEntry, current))`
  per drop; it removes the entry the drop names by identity, so a
  dangling entry that shares its id with a valid one is dropped alone
  (probe "a dangling Link that shares its id"). `recoverWith` fits a part with a known fallback (a Piece to
  Nothing, with the drop as its diagnostic); the diagnose-and-retry loop
  is not a `recover`.
- The `format: world-v2` gate is one more diagnostic of the prelude,
  first in the list. The port treats it as blocking (probe "the format
  gate"); the consumer reads past it, which its own test pins. That is a
  consumer choice, not a definition of `toResult`.
- `map` and `andThen` infer their callback's parameter from the callback
  alone, as `/result`'s `map` does for `map((x) => x, success(1))` (the
  same probe). Pinned instances where an
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
  `gather`, `recover`, `recoverWith` and `toResult`, and the types
  `BestEffort` and `NotABestEffort`, at `/best-effort`. It leaves
  accumulation to #118 and a Box to #89. Its tests are the kit probes,
  rewritten on local fixtures: the runtime describe "the kit", the type
  describes "the guards", "a Maybe part" and "inference", and "toResult
  of a Maybe part", rewritten on a local `bestEffort<Maybe<string>,
string>(undefined)`. The port probes (the runtime describe "the
  consumer on the kit", and the type probe "readOpenWhen is
  BestEffort<Maybe<string>, WorldFormatError>") and "toResultUnguarded
  admits all of them" stay in the prototype.

## Amendment of 2026-11-18 (#127): the module as built

`/best-effort` ships as `src/best-effort/index.ts`, built from the kit in
`prototypes/117/best-effort.ts` without `toResultUnguarded`. The root entry
point gains the namespace `bestEffort`. The kit probes, rewritten on local
fixtures with their titles kept, are `src/best-effort/index.test.ts` (the
runtime describe "the kit") and `src/best-effort/index.test-d.ts` (the type
describes "the guards", "a Maybe part" and "inference"). The rare edges and
missing pins the review rounds of #117 deferred are decided as follows, each
pinned by the test named.

- **`toResult` and a `T` of `any`:** the refusal stays; the two guards are
  not composed, so the message names no fix (probe "toResult refuses a T of
  any").
- **`map` and a `Promise` of a box:** `map` does not refuse one, and
  `toResult` leaves it inside the Success (probe "a Best Effort inside a
  container is not refused", the `Promise` instance).
- **`andThen` and a box-valued step:** `andThen` admits a step whose value
  is a box, giving a `BestEffort<BestEffort<…>, …>`, and `toResult` refuses
  that result (probe "andThen admits a step whose value is a box, and
  toResult refuses the result").
- **`gather` and `D`:** `gather` does not union `D` across parts; parts of
  different `D` are written `gather<T, D>(…)`. Its parameter is a `readonly`
  array (probe "gather does not union D across parts: parts of different D
  need gather<T, D>(…), and a readonly array of parts is accepted").
- **A box behind a declared type:** a `{ readonly value: number }`-typed box
  leaves `toResult` inside the Success at runtime too (probe "a box behind
  the declared type { readonly value: number } leaves toResult inside the
  Success, as that box with its list").
- **The guard boundary:** `{ value: number; diagnostics?: readonly string[]
}`, `diagnostics: readonly string[] | undefined`, `Iterable` and
  `unknown` diagnostics are not refused (probe "the guard does not refuse
  { value: number; diagnostics?: readonly string[] }, diagnostics:
  readonly string[] | undefined, Iterable diagnostics or unknown
  diagnostics"); an object value with object diagnostics is refused (probe
  "an object value and object diagnostics do not keep a box from being
  refused as a BestEffort").
