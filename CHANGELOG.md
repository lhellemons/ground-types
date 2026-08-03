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

### Changed

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
