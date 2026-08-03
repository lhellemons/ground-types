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
