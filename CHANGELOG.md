# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
- `call` — `Call` and `AbortableCall`, plus `abortable` and `resultify`
  for lifting a Call into an abortable or Result-returning one.
- `abort` — `AbortError`, `isAbortError` and `ABORT_ERROR_NAME`. Because
  `DOMException` inherits from `Error`, an `AbortError` is already a
  valid `Failure`.
- `AbortablePromise.detach` — severs the upstream abort link, so a branch
  can be cancelled without cancelling the source it shares.
- `fn` gains `Mapper`, `CurryableMapper`, `curry`, `identity`, `constant`
  and `pipe`.
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
