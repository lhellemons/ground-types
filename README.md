# ground-types

Tactical DDD building blocks and the functional primitives they stand
on — Brand, Value Object, Entity, Factory, over Maybe and Result.

A _ground type_ is a type with no free type variables: fully concrete,
standing on nothing further. That is what this library is for — the
groundwork you lay before modelling a domain.

Every term used here is defined in [CONTEXT.md](./CONTEXT.md).

## Installing

```sh
pnpm add https://github.com/lhellemons/ground-types/releases/download/v0.4.0/lhellemons-ground-types-0.4.0.tgz
```

This is a built tarball attached to the GitHub Release, so nothing builds on
install. Consumer installs can use pnpm 10.34.9, 11 or 12, which record its
integrity hash in the lockfile: pnpm 10.8.1 records no hash and a download URL that expires.

The repository itself uses pnpm 12.18.0 for development and CI.

Alternatively, `pnpm add github:lhellemons/ground-types#semver:^0.4.0`
tracks compatible tags, but runs `prepare` to build during installation. On pnpm
11 and later, explicitly allow this dependency's build in your pnpm configuration
before installing; review the resolved source before approving it.

Renovate updates the `github:` semver form automatically. A pinned release URL
needs a custom manager, for example in `renovate.json`:

```json
{
  "customManagers": [
    {
      "customType": "regex",
      "managerFilePatterns": ["/package\\.json$/"],
      "matchStrings": [
        "https://github\\.com/lhellemons/ground-types/releases/download/v(?<currentValue>[0-9]+\\.[0-9]+\\.[0-9]+)/lhellemons-ground-types-[0-9.]+\\.tgz"
      ],
      "datasourceTemplate": "github-tags",
      "depNameTemplate": "lhellemons/ground-types",
      "extractVersionTemplate": "^v(?<version>.*)$",
      "autoReplaceStringTemplate": "https://github.com/lhellemons/ground-types/releases/download/v{{{newValue}}}/lhellemons-ground-types-{{{newValue}}}.tgz"
    }
  ]
}
```

Maintainers: update `package.json`'s version and the changelog, merge to `main`,
then push the matching `v<version>` tag. CI runs the checks, packs the build and
creates or updates the release asset. Rerunning the workflow replaces that asset.
Registry publishing remains out of scope.

## Modules

Each module is a separate subpath export.

| Subpath            | Exports                                                                                                                                                                                                                                         |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/maybe`           | `Maybe`, `Just`, `Nothing`, `maybe`, `just`, `nothing`, `fromNullable`, `isJust`, `isNothing`, `orElse`, `fallback`, `map`, `andThen`, `assertJust`, `fromResult`                                                                               |
| `/result`          | `Result`, `Success`, `Failure`, `ThrownError`, `NotAResult`, `NotAPromise`, `result`, `success`, `failure`, `isSuccess`, `isFailure`, `catchOnly`, `tryCatch`, `assertSuccess`, `map`, `mapError`, `fallback`, `orElse`, `andThen`, `fromMaybe` |
| `/brand`           | `Brand`, `Branded`                                                                                                                                                                                                                              |
| `/value-object`    | `Primitive`, `PrimitiveValueObject`, `definePrimitiveValueObject`                                                                                                                                                                               |
| `/domain`          | `Entity`, `CompoundValueObject`, `DTOSource`, `DomainObjectFactory`                                                                                                                                                                             |
| `/intern-registry` | `InternRegistry`, `internByKey`                                                                                                                                                                                                                 |
| `/fn`              | `Fn`, `Mapper`, `CurryableMapper`, `compose`, `pipe`, `curry`, `identity`, `constant`                                                                                                                                                           |
| `/promise`         | `AbortablePromise`, `AbortContext`, `RejectionError`, `resultify`, `fail`, `recoverWith`, `State` with its constructors and guards, `settledResult`, `stateOf`, `TrackedState`                                                                  |
| `/promise/fake`    | `fakePromise`, `fakeAbortablePromise`                                                                                                                                                                                                           |
| `/call`            | `Call`, `AsyncCall`, `AbortableCall`, `abortable`, `resultify`                                                                                                                                                                                  |
| `/abort`           | `AbortError`, `isAbortError`, `ABORT_ERROR_NAME`                                                                                                                                                                                                |

```ts
import { andThen, isFailure } from '@lhellemons/ground-types/result'
import type { Branded } from '@lhellemons/ground-types/brand'
import { definePrimitiveValueObject } from '@lhellemons/ground-types/value-object'
```

Modules share a name deliberately: `map` in `/maybe` and `map` in
`/result` are the same idea over different containers, and so are
`resultify` in `/promise` and `resultify` in `/call`. Import per module
rather than flattening them into one namespace.

`/promise/fake` is a separate subpath rather than part of `/promise` so
that test doubles cannot reach a production bundle by accident.

There is also a root entry point, for a bare
`import from '@lhellemons/ground-types'` and for tooling that predates or
ignores the `exports` map. It re-exports each module as a namespace, named
after its subpath (`intern-registry` becomes `internRegistry`,
`value-object` becomes `valueObject`, the rest unchanged), so `maybe.map`
and `result.map` stay distinct here too — nothing is flattened. Per-module
import remains the recommended style, for the same reason as above;
`/promise/fake` is not part of the root, for the same reason as above.

```ts
import { maybe, result } from '@lhellemons/ground-types'

result.map(...)
maybe.map(...)
```

## Selective domain failures

For domain code, use `tryCatch(construct, catchOnly(InvalidValue))` or
`definePrimitiveValueObject(construct, catchOnly(InvalidValue))`, importing
`catchOnly` from `@lhellemons/ground-types/result`. Listed errors (including
subclasses) from the current realm become failures unchanged; all other throws,
including foreign-realm errors, propagate unchanged.
`tryCatch(construct, [InvalidValue, OtherError])` is shorthand.
Handlers such as `() => new InvalidValue()` turn bugs into domain failures.

## Validating domain values

A Primitive Value Object factory is callable. Use the throwing form when
invalid input is a programming bug; use `.from` when invalid input is
expected and the caller should handle a Failure.

```ts
import type { Branded } from '@lhellemons/ground-types/brand'
import { definePrimitiveValueObject } from '@lhellemons/ground-types/value-object'
import { catchOnly, isFailure } from '@lhellemons/ground-types/result'

class InvalidBoardId extends Error {}
type BoardId = Branded<string, 'BoardId'>
const BoardId = definePrimitiveValueObject((value: string): BoardId => {
  if (typeof value !== 'string' || value.length === 0) {
    throw new InvalidBoardId('BoardId must be a non-empty string')
  }
  return value as BoardId
}, catchOnly(InvalidBoardId))

const id = BoardId('board-1') // throws on invalid input
const outcome = BoardId.from('') // Result<BoardId, InvalidBoardId>
if (isFailure(outcome)) console.log(outcome.message)
```

`BoardId(x)` expresses the same throwing intent as
`assertSuccess(BoardId.from(x))` directly.

For a class Factory, `implements` checks only instances. A static block
checks the class's static side against `DomainObjectFactory`:

```ts
import type { DomainObjectFactory } from '@lhellemons/ground-types/domain'
import { tryCatch } from '@lhellemons/ground-types/result'
import type { Result } from '@lhellemons/ground-types/result'

class InvalidDoor extends Error {}
type DoorDTO = { open: boolean }
class Door {
  private constructor(readonly open: boolean) {}

  static {
    void (Door satisfies DomainObjectFactory<Door, DoorDTO>)
  }

  static from(dto: DoorDTO): Result<Door, InvalidDoor> {
    return tryCatch(() => {
      if (typeof dto.open !== 'boolean') throw new InvalidDoor('Invalid door')
      return new Door(dto.open)
    }, [InvalidDoor])()
  }
}
```

Brands exist only in TypeScript; JSON preserves neither proof of validation
nor class prototypes. Treat parsed data as untrusted and re-validate a
Branded primitive with `BoardId.from`, or rebuild a domain object through
its Factory's `from(dto)`. Never use `JSON.parse(text) as Door` to bypass
that boundary. Check the DTO's shape before passing it to a typed Factory:

```ts
const parsed: unknown = JSON.parse('{"open":true}')
if (
  typeof parsed === 'object' &&
  parsed !== null &&
  'open' in parsed &&
  typeof parsed.open === 'boolean'
) {
  const restored = Door.from({ open: parsed.open })
}
const raw: unknown = JSON.parse('"board-1"')
if (typeof raw === 'string') {
  const restoredId = BoardId.from(raw)
}
```

## Interned instance lifetime

`InternRegistry<K, V>` holds object values weakly. While a caller keeps an
instance alive, equal keys return that same instance:

```ts
import { InternRegistry } from '@lhellemons/ground-types/intern-registry'

const registry = new InternRegistry<string, { key: string }>()
const first = registry.getOrCreate('a', () => ({ key: 'a' }))
const second = registry.getOrCreate('a', () => ({ key: 'a' }))
console.log(first === second) // true
```

After callers release an instance, garbage collection may reclaim it;
`get` then returns Nothing and `getOrCreate` can create a fresh instance.
Collection and finalizer cleanup have no guaranteed timing. Keys remain
strongly held until cleanup, so prefer identifier keys: a key that refers
to its canonical instance keeps that instance alive, even with weak values.
A module-scope registry therefore does not by itself retain every value
forever, but it is not a bounded store or a deterministic eviction policy.

## Composing a chain of steps

Given only its configuration, every `maybe`/`result` combinator returns a
unary function, so a chain of them nests unless something unwinds it.
`pipe`, from `/fn`, runs a value through a sequence of steps left to
right, in the order the data actually flows:

```ts
import { pipe } from '@lhellemons/ground-types/fn'
import { andThen, map, maybe, orElse } from '@lhellemons/ground-types/maybe'

const label = pipe(maybe(x), map(double), andThen(validate), orElse(0))
// instead of orElse(0)(andThen(validate)(map(double)(maybe(x))))
```

`pipe` always applies immediately — there is no deferred, build-a-function
form. Each step's parameter type is pinned to the previous step's return
type, up to ten steps; a step that doesn't fit its neighbour is a compile
error at that step. For building a reusable function with no value in
hand yet, use `compose`, which reads right to left instead and is typed
the same way, up to ten Mappers:

```ts
import { compose } from '@lhellemons/ground-types/fn'

const shoutLabel = compose(shout, stringify, double)
shoutLabel(21) // same as shout(stringify(double(21)))
```

See [docs/adr/0004-pipe-value-first.md](./docs/adr/0004-pipe-value-first.md)
for why `pipe` is shaped this way.

## The asynchrony layer composes with the primitives

There is no `mapAsync`, no `AsyncResult`, and no second combinator set for
asynchronous code. There does not need to be: every `Result` combinator,
given only its configuration, returns a unary function, so `.then` already
composes with them.

```ts
import { fail, resultify } from '@lhellemons/ground-types/promise'
import { map, orElse } from '@lhellemons/ground-types/result'

const label = await resultify(fail, fetchWidgetCode())
  .then(map((code: number) => `widget-${code}`))
  .then(orElse('no widget'))
```

`resultify` turns a promise that may reject into one that always resolves
with a `Result`; `map` and `orElse` are the same functions you would use
on a synchronous `Result`. The same holds for `andThen`, `fallback`, and
the `Maybe` combinators.

Going the other way, `State` bridges back:

```ts
import { settledResult, stateOf } from '@lhellemons/ground-types/promise'

const tracked = stateOf(fetchWidget())
settledResult(tracked.current) // Nothing while pending, a Result once settled
```

## Requirements

Node 20 or newer, and a TypeScript `lib` that includes `DOM` **or**
`@types/node`. `/promise` and `/abort` are built on `AbortController`,
`AbortSignal` and `DOMException`, which are WHATWG platform standards
rather than document APIs — present in browsers, Node 20+, Deno and Bun
alike — but they are not in `lib.es2022`, and they appear in this
library's emitted declarations. A consumer whose own `lib` is
`["ES2022"]` alone will not be able to resolve them.

## The unboxed encoding

`Maybe` and `Result` are unboxed. A `Just<T>` **is** the `T`, a
`Nothing` **is** `undefined`, a `Success<T>` **is** the `T`, and a
`Failure` **is** the `Error` — discriminated at runtime by
`instanceof Error`, with no wrapper object allocated.

This makes them nearly free to pass across a boundary, and it means a
value that is already a `T` needs no unwrapping at the point of use. The
cost is that nesting is unrepresentable: there is no `Result<Result<T>>`.
Chain a second fallible step with `andThen`, which takes a function
returning a `Result` and never nests:

```ts
const widgetIdOf = andThen((code: number) =>
  code > 0 ? success(`widget-${code}`) : failure(new WidgetError(code)),
)
```

A `Success` is statically prevented from being an `Error`, so the
`instanceof` discrimination cannot be fooled by a success value that
merely happens to be Error-shaped.

## Status

v0.2.x, plus a batch of unreleased work on `main`. `maybe` and `result`
offer a matching combinator set — `map` and `andThen`, eager `orElse` and
lazy `fallback`, and a bridge each way between the two modules
(`maybe/fromResult`, `result/fromMaybe`) — and every export carries a
docblock. The match is deliberate rather than mechanical, and so are its
two exceptions: `maybe/andThen` is a true alias of `maybe/map`, because a
`Maybe` cannot nest, whereas `result/andThen` is genuinely distinct from
`result/map`, because a `Result` can; and `result/mapError` has no `maybe`
counterpart, because `Nothing` carries nothing to transform. See
[docs/adr/0001-unboxed-maybe-and-result.md](./docs/adr/0001-unboxed-maybe-and-result.md)
for the rationale behind the encoding and these symmetry choices.

Unreleased on `main`: an asynchrony layer — `/promise`, `/call` and
`/abort` — built on the same primitives, a `/fn` grown to hold the whole
function vocabulary, and a rounding-out of the primitives themselves
(`result/mapError`, `maybe/fromNullable`, the root entry point). Two
things to know about it:

- **Abort propagates upstream.** Aborting a promise derived through
  `then` aborts the one it came from, so cancelling the tail of a chain
  really cancels the work at the head. The consequence is that two
  branches off one source can abort each other; `detach()` severs that
  link at a branch point. See
  [docs/adr/0002-abort-propagation.md](./docs/adr/0002-abort-propagation.md).
- **The whole library is curryable, decided by arity.**
  `promise/resultify(fail, promise)` and `promise/resultify(fail)` are
  both valid, and so are `result/map(fn, value)` and `result/map(fn)` —
  every config-taking `maybe`/`result` combinator now offers the same
  dual shape. Which shape a call is in is decided by how many arguments
  were passed, never by inspecting a value — `Nothing` _is_ `undefined`,
  so `map(fn, nothing())` applies rather than handing back the Mapper.
  See [docs/adr/0003-currying.md](./docs/adr/0003-currying.md).

Upgrading from 0.1.x or 0.2.x? See the
[0.1.0 → 0.3.0 migration guide](./docs/migration/0.1.0-to-0.3.0.md).

Not yet published to npm; expect breaking changes within 0.x.

## Licence

MIT — see [LICENSE](./LICENSE).
