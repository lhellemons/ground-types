# PROTOTYPE #59 — typed fan-in over the unboxed Result

Throwaway probe for
[#59](https://github.com/lhellemons/ground-types/issues/59). Nothing here
is part of the library: `src/` never imports it, and nothing in `src/`
changes. The arms import the library by relative path.

    prototypes/59/run.sh

The script typechecks the arms against `src/` on main, runs the type and
runtime probes, then counts the declaration-emit errors per arm.

## What is measured

Three slider factories (`src/domain/grid/position.ts`,
`src/domain/board/door.ts`, `src/domain/slide/slide.ts`), modelled in
`slider.ts` with one typed error per leaf where slider writes `Error`, and
built four ways:

| File         | Shape                                                                                              |
| ------------ | -------------------------------------------------------------------------------------------------- |
| `current.ts` | slider today: `tryCatch((dto) => { const x = assertSuccess(X.from(dto.x)); … })(dto)`             |
| `arm-a.ts`   | **A.** `collect({ … })` over the parts, then `map`/`andThen` or an early return; `collectAll` too  |
| `arm-b.ts`   | **B.** `attempt((take) => new Door(take(PieceId.from(dto.id)), …))`, a private-token leave         |
| `arm-c.ts`   | **C.** `gen(function* () { const id = yield* take(PieceId.from(dto.id)); … })`, plus one A+C form  |

The candidates themselves are in `fan-in.ts`. Each factory has a
precondition on the DTO (`WrongKind`, `BothGateForms`, `EmptyPath`), a
nested struct (`unlock-with`), an optional part (`open-when`, `pieceId`), a
list (`path`) and a step that depends on built parts (Position's key,
Slide's `pieceId`/`terminal` rule). Arms A and C leave the return type
un-annotated so the probes measure what TypeScript infers; arm B is
annotated because that is where its `E` comes from (below).

## Scoreboard (TypeScript 5.9.3, main at a1b0b73)

| Criterion                              | current                                            | A. `collect`                                                                                                                                                                                                                              | B. `attempt`/`take`                                                                                                                                                                                       | C. `gen`/`yield* take`                                                                                                   |
| -------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Error-union inference                  | none: every factory is `Result<X, Error>`          | yes, from the parts. Exact through `map`/`andThen`. The early-return form (`if (isFailure(parts)) return failure(parts)`) leaks the re-wrapped `Failure` into the union, and an un-annotated factory that mixes early returns with a combinator returns a union of Results that `isFailure` cannot take: annotate | **no inference site in the body.** With no contextual type `E` falls to `Error` (not `never` as the ticket's probe said). A return annotation supplies `E`, and `take` then rejects a part outside it. Slider annotates every `static from` already | yes, exact, dependent steps included, with no annotation anywhere                                                      |
| Bugs stay separate from Failures       | no: a `TypeError` inside a part becomes a Failure  | yes: nothing is caught                                                                                                                                                                                                                    | yes: only this call's own token is caught; a `take` from another `attempt` propagates, as does any other throw                                                                                           | yes: nothing is caught; `finally` blocks run on a failure through `return()`                                             |
| Dependent steps                        | yes                                                | not in one call: `andThen` after `collect`, or an early return                                                                                                                                                                            | yes                                                                                                                                                                                                       | yes                                                                                                                      |
| Use inside callbacks (`.map`, Maybe)   | yes                                                | by nesting: `collect(dto.path.map(Position.from))`; an optional part is a Maybe of a Result, read as a Result of a Maybe                                                                                                                  | yes: `take` leaves by throwing, so `dto.path.map((p) => take(Position.from(p)))` works                                                                                                                    | **no**: `yield*` cannot sit in a nested function. A loop, or A+C: `yield* take(collect(dto.path.map(Position.from)))`     |
| Readability against slider             | 119 lines                                          | 172 lines; a different shape, data first, construction in a callback; the factory's own checks stay early returns on the DTO                                                                                                               | 135 lines; a near-verbatim port: `assertSuccess` becomes `take`, the body sits in `attempt`, own checks become `take(failure(…))` or early returns                                                        | 166 lines; `function*`/`yield*` on every part; own checks are `yield* take(failure(…))` (a plain `return failure(…)` lands in `T`) |
| Next to the Result Box (ADR 0005)      |                                                    | a natural static entry: `Result.collect({ … }).map(…)`                                                                                                                                                                                     | a static entry is possible: `Result.attempt((take) => …)`                                                                                                                                                 | cannot be a method; stands alone                                                                                         |
| Declaration emit, un-annotated factory | n/a                                                | 6 × TS4050 (the inferred type names the private markers)                                                                                                                                                                                 | n/a                                                                                                                                                                                                       | none                                                                                                                     |
| Allocation on success                  | the Door                                           | none: `collect` returns its argument, the parts are already unboxed                                                                                                                                                                       | one token per call                                                                                                                                                                                        | one generator per call, one per `take`                                                                                   |

## Accumulation (for #65)

`collectAll` is A with every failed part kept: `Result<Collected<P>,
Failures<E>>`, where `Failures<E>` is an `AggregateError` subclass with
`errors: E[]` in part order. It fits the unboxed encoding as any other
Failure does, and `Door.fromAll` in `arm-a.ts` measures it: a bad `id` and a
bad `unlock-with` come back as one `Failures` holding an `InvalidPieceId`
and a nested `Failures<InvalidCollectibleGroup | InvalidUnlockCount>`, so a
nested struct nests its failures; flattening is a choice, not a given. The
preconditions (`WrongKind`, `BothGateForms`) stay single Failures ahead of
it. Neither B nor C has an accumulating form: both leave at the first
failure by construction.

## Facts the probes settle

- B's `E` is found from the enclosing return annotation (contextual return
  type), and rejects a `take` of a part outside it; with no annotation it is
  `Error`. An explicit `attempt<T, E>` works where there is no annotation.
- A, B and C all let a bug propagate, with an `Error` or a bare string.
  `current` turns both into a Failure (the string as a `ThrownError`).
- In C, a `yield*` is not allowed inside a nested function, so lists and
  Maybe callbacks are loops or go through `collect`.
- In A, the early-return form needs the annotation slider already writes;
  the `map`/`andThen` form infers the exact union on its own.
- `collect` takes a struct, a tuple or a list, and passes a plain
  non-Result member through unchanged.
