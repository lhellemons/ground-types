# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
