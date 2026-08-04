# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

- **Breaking:** `result/map`, `result/andThen` and `result/tryCatch` now
  reject a callback whose return type has a thenable arm — a `Promise`, a
  non-native thenable, or a sync/async union such as
  `(n) => number | Promise<number>` — at compile time. Nothing in `/result`
  asserted that a value resolves synchronously: `tryCatch(async () => { throw
... })` returned a value `isSuccess` reported as `true`, which then rejected
  unhandled (#6), and `andThen`/`map` given an `async` callback silently
  inferred a `Success` whose value is itself an unresolved `Promise` (#15).
  Both were symptoms of one gap, not two bugs. Detection goes by shape
  (`HasThenableArm`, distributing over the callback's return type) rather than
  exact `Promise` type equality, and by structural `then` duck-typing rather
  than `instanceof` — the same rule `await` itself uses — so it also catches a
  custom deferred and a callback that only sometimes returns a `Promise`.
  `fallback` needed no matching guard: its callback's return type is pinned to
  `Success<T, E>` rather than inferred from a free type parameter, so a
  thenable already fails ordinary structural assignability there.

  No new async combinators were added. `promise/resultify` and
  `call/resultify` are already the sanctioned lift from a rejecting
  `Promise`/`Call` to a `Promise<Result<T, E>>`, and every `/result`
  combinator is a plain unary function, so it already composes with `.then()`.
  This is not the `all`/`sequence` fan-in ADR-0001 refuses: a lift to
  `Promise<Result<T, E>>` wraps the same unboxed `Result` in a container the
  platform already provides, resolved before anything inspects it — it does
  not erode the "a `Success` can never be an `Error`" guarantee.

- Every config-taking combinator in `maybe` (`map`, `andThen`, `orElse`,
  `fallback`) and `result` (`map`, `andThen`, `orElse`, `fallback`,
  `fromMaybe`) is now curryable: `map(fn)` still returns a unary Mapper,
  and `map(fn, value)` applies it immediately. This closes the split
  calling convention ADR-0003 recorded — `promise/resultify(fail,
promise)` was curryable while `result/map(fn)` was not — so the whole
  library now reads one way. Which shape a call is in is decided by
  arity, never by inspecting the value: `Nothing` _is_ `undefined`, so
  `map(fn, nothing())` applies rather than handing back the Mapper.
  Existing call sites are unaffected; the unapplied forms of `result/map`
  and `result/andThen` still return generic functions whose `T`/`E` bind
  at application, pinned by type-level tests. See
  [docs/adr/0003-currying.md](./docs/adr/0003-currying.md).

An asynchrony layer, ported from another project and reworked to fit this
library. No release cut; see
[docs/adr/0002-abort-propagation.md](./docs/adr/0002-abort-propagation.md)
and [docs/adr/0003-currying.md](./docs/adr/0003-currying.md).

### Added

- `promise` — `AbortablePromise`, a `Promise` subclass that can be
  aborted before it settles; `State`, the four-case machine for where an
  asynchronous operation is; `RejectionError`; and `resultify`, `fail`
  and `recoverWith` for turning a rejecting promise into one that always
  resolves with a `Result`.
- `promise/fake` — `fakePromise` and `fakeAbortablePromise`, manually
  settleable promises for testing. A separate subpath, so test doubles
  cannot reach a production bundle by accident.
- `call` — `Call`, `AsyncCall` and `AbortableCall`, plus `abortable` and
  `resultify` for lifting a Call into an abortable or Result-returning
  one.
- `abort` — `AbortError`, `isAbortError` and `ABORT_ERROR_NAME`. Because
  `DOMException` inherits from `Error`, an `AbortError` is already a
  valid `Failure`.
- `AbortablePromise.detach` — severs the upstream abort link, so a branch
  can be cancelled without cancelling the source it shares.
- `fn` gains `Mapper`, `CurryableMapper`, `curry`, `identity`, `constant`
  and `pipe` — `pipe(value, ...steps)` runs `value` through up to ten
  `Mapper` steps left to right, applied immediately.
- `State` gains constructors, guards, `settledResult` — the bridge to the
  primitives, `Nothing` while the operation is unfinished and a `Result`
  once it settles — and `stateOf`, a live view of a promise's State.
- `result/ThrownError` — the Error a thrown value is wrapped in when it
  was not already one, so a `Failure` always carries an `Error`. The
  synchronous case of `promise/RejectionError`, which now extends it
  rather than keeping a second copy of the same defensive rendering.
- `pnpm assert:exports`, run in CI, checks that every subpath in
  `package.json`'s `exports` resolves and imports, and that every built
  module is reachable through one. `pnpm install` already builds through
  `prepare`, so a broken emit fails the job; nothing checked that the
  entry points the package advertises matched what came out of the build,
  which is what four new subpaths made worth checking.

A second pass then reviewed how the ported modules sit against the
existing primitives, and closed the gaps it found.

### Changed

- **`resultify` returns a plain `Promise`, never an `AbortablePromise`.**
  Previously an abort meant two different things depending on which
  handle you held: aborting the source resolved with a `Failure`, while
  aborting the lifted promise rejected with an `AbortError`. There is now
  one abortable handle, so abort has one outcome. A lifted `Call` is
  correspondingly not cancellable; hold the promise and lift where you
  consume it.
- **`all`, `race`, `any` and `allSettled` abort their members.**
  Inherited from `Promise`, they returned something whose `abort()` ran
  and left every member going. Plain-`Promise` members are skipped, and
  the losers of a `race` are not aborted.
- **The executor's third argument is an `AbortContext`, not an
  `AbortSignal`.** `context.signal` is a lazy getter, so the
  `AbortController` and its `EventTarget` are allocated only when
  something actually reads it — a `resolve().then().then()` chain now
  allocates none, where it previously allocated four.
- `result/tryCatch`'s `errorHandler` returns a `Result` rather than an
  `Error`, matching `resultify`'s rejection mapper, so one handler
  vocabulary covers both and a handler may now recover. Backward
  compatible: every `E` is already a `Result<T, E>`.
- `call/resultify` takes its type parameters as `<O, E, I>`, so the two
  it shares with `promise/resultify<O, E>` keep their positions.
- `promise/recoverWith` delegates to `fn/constant` instead of
  reimplementing it.
- `tsconfig` `lib` now includes `DOM`, for `AbortController`,
  `AbortSignal` and `DOMException`. These reach the emitted declarations,
  so consumers need `DOM` or `@types/node` in their own `lib`.
- `curry` decides whether it was given an input by arity rather than by
  testing for `undefined`. The old test was unsafe here, where `Nothing`
  _is_ `undefined`.
- `fail` is generic in the success type it never produces, so
  `resultify(fail, promise)` no longer infers `Result<Error, Error>`.
- `AbortablePromise` rejects with a fresh `AbortError` per abort rather
  than one shared instance, so each carries the stack of the abort that
  happened. Recognise them with `isAbortError`, not by identity.
- `AbortablePromise.resolve` follows the standard `Promise.resolve`
  overloads; it previously widened the element type with `undefined`.
- **Breaking: `pipe` reversed to value-first, N-ary, always immediate**, the same
  day it was ported in as function-first, 2-ary and curryable. The
  curryable shape couldn't chain more than two steps without nesting —
  the exact problem it was meant to solve (#7) — and its deferred form
  (`pipe(f1, f2)`, no value) cannot infer a bare unannotated step: there
  is nothing in that call for TypeScript to anchor on, measured by
  emitting declarations rather than assumed. `pipe(x, f1, ..., f10)` now
  pins every step's parameter type to the previous step's return type,
  and was run through a 7-step chain mixing `maybe` and `result`,
  bridged mid-chain, without inference degrading. See
  [docs/adr/0004-pipe-value-first.md](./docs/adr/0004-pipe-value-first.md).

A review pass then found four places where the layer did not hold its own
contracts, and closed them.

### Fixed

- **`resultify` no longer rejects when the rejection reason cannot be
  rendered.** `RejectionError` built its message by interpolating the
  reason, which throws for a symbol, an object with a null prototype, or
  anything whose `toString` throws — so `fail` threw and the throw escaped
  as a rejection, in exactly the case `RejectionError` exists to serve.
  The message is now built defensively; `reason` is untouched either way.
- **Resolving with a promise no longer closes the abort window.**
  `new AbortablePromise((resolve) => resolve(work()))` counted as settled
  the moment `resolve` was called, so `abort()` silently did nothing for
  the delegating shape the class exists for. A resolution handed a
  thenable is now adopted and settles with it; a resolution handed a plain
  value settles at once, as before.
- **Aborting a promise aborts the `AbortablePromise` it delegated to.**
  Keeping the abort window open said when the abort was still allowed, not
  where it went: the outer promise rejected while `work()` ran on,
  uncancelled and unobserved. Delegation is upstream, so abort now travels
  it as it travels `then`. A plain-`Promise` delegate is left alone, since
  there is nothing on it to abort, and `resolve(work().detach())` hands
  over the outcome without handing over the right to cancel.
- **`AbortablePromise.all` and `allSettled` keep `Promise`'s tuple
  overloads**, along with `race` and `any`. Overriding with only the
  iterable signature made `AbortablePromise.all([promiseOfA, promiseOfB])`
  a type error rather than a tuple, and degraded a same-type call from
  `[number, number]` to `number[]`.
- **A `Call` that throws synchronously is reported as a rejection.** A
  Call may settle synchronously, so it may fail that way; the throw
  escaped both `call/resultify`, which promises never to reject, and
  `call/abortable`, which is typed as returning an `AbortablePromise`.
  Both now route it through the same path as an asynchronous failure.
- `RejectionError`'s type parameter defaults to `unknown`, so the bare
  name is usable in a type annotation.
- `AbortState` drops its upstream links when the promise settles, rather
  than only when it is aborted, so a retained tail no longer keeps its
  whole chain reachable.
- `call/resultify`'s overloads are ordered applied-form-first, matching
  `promise/resultify`, and it no longer hand-rolls a `Promise` normaliser.
- An abort is a rejection, so aborting a promise nothing is consuming
  ends a Node process. The shapes the design is built around are safe —
  a chain handles its own head, the fan-in combinators handle their
  members, and `detach` leaves its source alone, all three now pinned by
  tests — but `AbortablePromise.abort()`, `abortOn` and `peer` can each
  reach an unconsumed promise, and now say so.
- Docblocks: `call/abortable` (a stub) and `promise/fake` are brought to
  the standard of the rest of the library, `settledResult` documents that
  it cannot distinguish a fulfilled `void` from an unfinished operation,
  `isAbortError` documents why narrowing to `AbortError` is sound for a
  platform `DOMException`, and `Call` documents why its output is named
  before its input.
- **`call/resultify` is typed as returning an `AsyncCall`**, not a
  `Call`. It builds a promise whatever it was handed, including for a
  Call that settles synchronously, so `Call`'s `O | Promise<O>` declared
  a union whose left branch cannot occur and left every caller to
  collapse it. `AbortableCall` is now defined as the abortable case of
  the same idea.
- **`pnpm build` clears `dist` first**, so `pnpm assert:exports` cannot
  report a module that no longer exists. `tsc` only ever adds to its
  outDir, so a renamed or dropped module left its old directory behind,
  and the check that every built module is exported then failed on it —
  on the one machine that did the rename, and never in CI, which always
  starts from an empty checkout.
- **A signal binding is released when the promise settles**, so binding
  many short-lived promises to one long-lived signal no longer
  accumulates a listener per promise, each pinning its closure and its
  abort state until the signal aborts — which for an application-lifetime
  signal means never. Covers both `abortOn` and a controller handed to
  the constructor, whose identical retention was undocumented. Nothing
  observes the settlement to do this; the release happens inside the
  bookkeeping that decides it, so the promise's handled-ness is
  untouched. ADR-0002's ruling that this could not be done is superseded
  there.
- **`tryCatch`'s default handler no longer lets a non-`Error` throw pass
  as a `Success`.** `throw` accepts any value and a `Result` is
  discriminated by `instanceof Error`, so a thrown string was returned
  unchanged and read as a `Success` — the failure vanishing into the very
  channel the lift exists to keep it out of. A thrown `Error` still passes
  through with its concrete subclass intact; anything else is wrapped in
  the new `result/ThrownError`, which is what `promise/fail` has always
  done with a rejection. The two lifts now agree in their defaults, not
  only in their handler shape.
- One imported test could never fail. `AbortablePromise.peer`'s
  "aborts the original one when aborted" wrapped its body in a `try` that
  logged and swallowed, so every assertion in it threw into the `catch`
  and the test passed whatever the class did. The `try` is gone.

A further pass then fixed the Result combinators' type inference, which
had been collapsing silently.

### Fixed

- **Breaking:** `result/andThen` no longer collapses its `Success` type to
  `unknown`. Chaining a callback that can itself fail — the ordinary case —
  inferred `Result<unknown, Error>`, because `Result<U, E>` was used as an
  inference site and TypeScript cannot infer `U` out of a union whose arms
  hide it behind a conditional (`Success`) and an intersection (`Failure`).
  The callback's return type is now captured whole and decomposed
  afterwards. The existing tests missed this: every one of them used a
  callback with a single return path, which infers correctly.
- **Breaking:** `result/andThen`'s error type now widens to the union of the
  input's error and the callback's, `Result<U, E | F>`, rather than forcing
  both to a single `E`. The curried function is generic, so `E` is inferred
  when the `Result` is applied instead of defaulting to `Error`.
- **Breaking:** `result/map` now rejects a `Result`-returning callback at
  compile time, naming `andThen` as the fix. This was already documented as
  a trap; in practice it inferred `any` and silently erased all downstream
  type checking.
- **Breaking:** `result/map` and `result/andThen` now take two type
  parameters rather than three. Call sites that passed type arguments
  explicitly — `map<number, string, MyError>(fn)` — no longer compile.
  Inferred call sites, which is nearly all of them, are unaffected.
- `result/andThen` keeps the `Failure` arm of a callback that returns a raw
  `Error` subclass instead of routing it through `failure()`. The two are
  the same value at runtime — both are identity casts, and discrimination
  is `instanceof Error` — but the error type was dropped from the union
  entirely, so a caller exhausting over the error type was wrong at
  runtime. Found in review of this change.
- `result/map`'s rejection of a callback returning an `Error` subclass as a
  plain value now says so — `'A Success can never be an Error — see
docs/adr/0001-unboxed-maybe-and-result.md'` — instead of misdirecting to
  `andThen`, which cannot fix it: `Success<T, E>` collapses to `never` for
  `T extends Error`, so there is no way to carry that value through this
  encoding. The callback-returns-a-`Result` message is unchanged for the
  case it actually describes. `NotAResult` is now exported so both messages
  can be pinned by type-level tests. (#16)

### Changed

- `Success` and `Failure` carry two additional compile-time-only phantom
  markers (`_value`, `_error`) giving the combinators a plain position to
  infer from. The unboxed encoding is unchanged, and both invariants
  ADR-0001 rests on still hold: `Result<Result<T>>` remains distinct from
  `Result<T>`, and a `Success` can never be an `Error`. Of the two
  original phantoms, only `Failure`'s `T` marker is what keeps
  `Result<Result<T>>` distinct from `Result<T>` — dropping it collapses
  the two, measured by emitting declarations. `Success`'s `E` marker is
  not load-bearing for that invariant; it is what makes `Success`
  invariant in `E`, tracked separately as issue #17.

### Added

- Type-level tests now run as real tests via Vitest's `typecheck` mode
  (`src/**/*.test-d.ts`), so a broken inference fails the suite instead of
  surfacing as a bare `tsc` error.
- ESLint with type-aware `typescript-eslint` rules, wired into `pnpm check`
  and CI (#12): `no-floating-promises`, `no-misused-promises`,
  `no-unnecessary-type-assertion`, `no-unnecessary-condition`,
  `no-explicit-any` and the `no-unsafe-*` family. `no-unnecessary-type-assertion`
  found four genuinely redundant casts in `result/index.ts` (`failure`,
  `tryCatch`'s catch branch, and an inner cast each in `map` and `andThen`),
  now removed. The handful of casts that remain in that file route around a
  TypeScript limit the compiler can't reduce — a deferred conditional type —
  confirmed load-bearing by re-running the type suite with each removed one
  at a time; the two remaining false-positive spots (`maybe/isJust`,
  `maybe/isNothing`, `result/fromMaybe`) carry a narrow, commented
  `eslint-disable-next-line` rather than a blanket file-level exemption.

  Run against the async layer, the same rules turned up an unused `Failure`
  import in `promise/resultify`, two redundant casts, and an `any` leaking
  out of `AbortablePromise`'s constructor — `value instanceof
AbortablePromise` narrows to `AbortablePromise<any>`, which then infected
  the type of the value it adopts. All four are fixed rather than silenced.
  Tests turn off exactly three rules (`prefer-promise-reject-errors`,
  `only-throw-error`, `require-await`): `/promise`, `/call` and `/result`
  exist to normalise an arbitrary thrown or rejected value into a `Failure`
  carrying an `Error`, so rejecting a bare string is the input under test.
  `AbortablePromise.then` and `.catch` keep `reason: any` — copied from
  lib.es5, where `unknown` would make the override reject the ordinary
  `.catch((e: Error) => …)` its base class accepts.

- Coverage via `@vitest/coverage-v8`, with a 90% threshold across lines,
  statements, branches and functions, wired into `pnpm check` and CI (#12).
  Coverage would not have caught the `result/andThen` and `result/map`
  inference bugs above — those lines were fully covered; the existing tests
  just used callbacks with a single return path, which infers correctly
  regardless. Coverage catches untested branches, not untested types; ESLint
  is what catches the latter. Currently 98.95%; the shortfall is
  `call/index.ts`, a barrel no test imports directly, and the untested
  `reason` getter on `promise/RejectionError`.

### Changed

- **Breaking:** `fn/Function` renamed to `fn/Fn`. The old name shadowed
  the global `Function` at every import site. Same signature, same
  behaviour. (#8)
- **Breaking:** `brand/Brand`'s key is now a module-private unique
  symbol instead of the plain string property `__brand`. A hand-rolled
  `as string & { __brand: '...' }` cast no longer produces a value
  assignable to a `Branded` type, and the brand key no longer appears in
  `keyof` on a branded value. Legitimate construction (`value as T`
  inside a validating constructor) is unaffected. (#9)

### Fixed

- README install line pinned a stale `^0.1.0`; now matches the current
  `0.2.0` release (#13).
- ADR-0001 claimed the maybe/result no-runtime-cycle invariant was
  "checked, not assumed" and "verified after every build" — nothing runs
  that check. Reworded to describe the invariant as convention-maintained
  and documented in the bridge functions' inline comments, not automated
  (#14).

## [0.2.0] - 2026-08-03

### Added

- `maybe/assertJust` — mirrors `result/assertSuccess`; throws when the
  value is Nothing.
- `maybe/fallback` — lazy counterpart to the existing eager
  `maybe/orElse`.
- `maybe/fromResult` — bridges `Result` to `Maybe`, discarding the error.
- `result/orElse` — eager counterpart to the existing lazy
  `result/fallback`.
- `result/fromMaybe` — bridges `Maybe` to `Result`, given an error to use
  for the Nothing case.
- Docblocks on every export across all seven modules.
- Test coverage for all seven modules, including type-level assertions.
- [docs/adr/0001-unboxed-maybe-and-result.md](./docs/adr/0001-unboxed-maybe-and-result.md),
  recording the rationale for the unboxed encoding and this release's
  symmetry rulings.

### Changed

- **Breaking:** `maybe/flatMap` renamed to `maybe/andThen`, for symmetry
  with `result/andThen`. Same signature, same behaviour.

### Removed

- **Breaking:** `maybe/flatten`. Provably an identity function —
  `Maybe<Maybe<T>>` and `Maybe<T>` are mutually assignable, so nothing
  ever nested and nothing was ever flattened.

## [0.1.0] - 2026-08-03

Initial extraction from Slider's `src/util`.

### Added

- `maybe` — `Maybe`/`Just`/`Nothing` over an unboxed `T | undefined`.
- `result` — `Result`/`Success`/`Failure` over an unboxed
  value-or-`Error` encoding.
- `brand` — `Brand`/`Branded` phantom-typing helpers.
- `value-object` — `definePrimitiveValueObject` for Primitive Value
  Objects.
- `domain` — `Entity`, `CompoundValueObject`, `DomainObjectDTO`,
  `DomainObjectFactory`.
- `intern-registry` — `InternRegistry` for canonicalising Value Objects.
- `fn` — `compose` and the `Function` type.
