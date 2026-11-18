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
needs a custom manager, for example in `renovate.json`. It uses the
`github-releases` datasource, which lists only published releases, so Renovate
never proposes a version whose tarball is not attached yet:

```json
{
  "customManagers": [
    {
      "customType": "regex",
      "managerFilePatterns": ["/package\\.json$/"],
      "matchStrings": [
        "https://github\\.com/lhellemons/ground-types/releases/download/v(?<currentValue>[0-9]+\\.[0-9]+\\.[0-9]+)/lhellemons-ground-types-[0-9.]+\\.tgz"
      ],
      "datasourceTemplate": "github-releases",
      "depNameTemplate": "lhellemons/ground-types",
      "extractVersionTemplate": "^v(?<version>.*)$",
      "autoReplaceStringTemplate": "https://github.com/lhellemons/ground-types/releases/download/v{{{newValue}}}/lhellemons-ground-types-{{{newValue}}}.tgz"
    }
  ]
}
```

Maintainers: update `package.json`'s version and the changelog, merge to `main`,
then push the matching `v<version>` tag. CI runs the checks, packs the build and
attaches the tarball to the GitHub Release:

- A new release starts as a draft and becomes public only after the upload
  succeeds, so a failed run never leaves a public release without its tarball.
- Rerunning the workflow completes a draft left behind by a failed upload.
- A release that is already public is never modified. A rerun succeeds without
  changes when the published tarball is byte-identical to the new build, or
  both decompress cleanly to the same contents (the compression may
  differ), and fails otherwise. To change a published release, ship a new
  version. A published release that lacks the tarball, or whose tarball does
  not decompress cleanly, also fails: convert it back to a draft and rerun.
- A version with a hyphen (`v1.0.0-rc.1`) is published as a pre-release. Only the
  highest release without a pre-release part (`vX.Y.Z`, with or without
  `+build` metadata) is marked Latest, so a pre-release or a
  back-port tag never takes that mark. Build metadata (`v1.0.0+build.1`) is
  ignored when versions are compared. The check looks at the newest 100
  releases.
- Release runs share one concurrency group, so tags pushed together run one at
  a time. GitHub keeps only one waiting run per group and cancels the older
  waiting run when a newer one queues: if a run is cancelled while waiting,
  rerun it. The release job is stopped after 15 minutes.

Registry publishing remains out of scope.

## Modules

Each module is a separate subpath export.

| Subpath            | Exports                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/maybe`           | `Maybe`, `Just`, `Nothing`, `maybe`, `just`, `nothing`, `fromNullable`, `isJust`, `isNothing`, `orElse`, `fallback`, `map`, `andThen`, `assertJust`, `fromResult`                                                                                                                                                                                                                                      |
| `/result`          | `Result`, `Success`, `SuccessArm`, `SuccessMarkers`, `Failure`, `FailureMarkers`, `ThrownError`, `NotAResult`, `NotAPromise`, `NotPossiblyAnError`, `NotAGenerator`, `Parts`, `Collected`, `Failed`, `Take`, `result`, `success`, `failure`, `isSuccess`, `isFailure`, `catchOnly`, `tryCatch`, `assertSuccess`, `map`, `mapError`, `fallback`, `orElse`, `andThen`, `fromMaybe`, `collect`, `attempt` |
| `/best-effort`     | `BestEffort`, `NotABestEffort`, `bestEffort`, `map`, `andThen`, `note`, `gather`, `recover`, `recoverWith`, `toResult`                                                                                                                                                                                                                                                                                 |
| `/brand`           | `Brand`, `Branded`                                                                                                                                                                                                                                                                                                                                                                                     |
| `/value-object`    | `Primitive`, `PrimitiveValueObject`, `definePrimitiveValueObject`                                                                                                                                                                                                                                                                                                                                      |
| `/domain`          | `Entity`, `CompoundValueObject`, `DTOSource`, `DomainObjectFactory`                                                                                                                                                                                                                                                                                                                                    |
| `/intern-registry` | `InternRegistry`, `internByKey`                                                                                                                                                                                                                                                                                                                                                                        |
| `/fn`              | `Fn`, `Mapper`, `CurryableMapper`, `compose`, `pipe`, `curry`, `identity`, `constant`                                                                                                                                                                                                                                                                                                                  |
| `/promise`         | `AbortablePromise`, `AbortContext`, `RejectionError`, `resultify`, `fail`, `recoverWith`, `State` with its constructors and guards, `settledResult`, `stateOf`, `TrackedState`                                                                                                                                                                                                                         |
| `/promise/fake`    | `fakePromise`, `fakeAbortablePromise`                                                                                                                                                                                                                                                                                                                                                                  |
| `/call`            | `Call`, `AsyncCall`, `AbortableCall`, `abortable`, `resultify`                                                                                                                                                                                                                                                                                                                                         |
| `/abort`           | `AbortError`, `isAbortError`, `ABORT_ERROR_NAME`                                                                                                                                                                                                                                                                                                                                                       |

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
after its subpath (`best-effort` becomes `bestEffort`, `intern-registry`
becomes `internRegistry`, `value-object` becomes `valueObject`, the rest
unchanged), so `maybe.map` and `result.map` stay distinct here too — nothing
is flattened. Per-module import remains the recommended style, for the same
reason as above; `/promise/fake` is not part of the root, for the same
reason as above.

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

## Best effort values

`BestEffort<T, D>`, from `/best-effort`, is a value usable as it stands
together with the diagnostics gathered while it was built, in the order they
were gathered: `{ value, diagnostics }`. `D` is any value. `bestEffort(value,
diagnostics)` builds one, and `D` defaults to `never`. The box and its list
are frozen in what this module's functions return; the value and each
diagnostic are not.

```ts
import { pipe } from '@lhellemons/ground-types/fn'
import {
  andThen,
  bestEffort,
  map,
  note,
  recover,
  toResult,
} from '@lhellemons/ground-types/best-effort'
import { failure } from '@lhellemons/ground-types/result'
import type { Result } from '@lhellemons/ground-types/result'

const read: Result<number, RangeError> = failure(new RangeError('bad'))

const outcome = pipe(
  recover(0, read), // { value: 0, diagnostics: [RangeError] }
  map((x: number) => x + 1),
  note(['defaulted']),
  andThen((x: number) => bestEffort(String(x), ['stringified'])),
  toResult((d) => new Error(`${d.length} diagnostics`)),
)
// a Failure: any diagnostic makes `toResult` a Failure
```

- `map(fn, box)` transforms the value, and the diagnostics ride along.
  `andThen(fn, box)` chains a step that returns a `BestEffort`: the first
  box's diagnostics come before the step's. `note(diagnostics, box)` appends
  after the ones held. `gather(parts)` fans a list of `BestEffort`s in: the
  values in part order, the diagnostics in part order. All parts share one
  `T` and one `D`; parts of different types are written `gather<T, D>(…)`.
  `map`, `andThen`, `note`, `recover`, `recoverWith` and `toResult` are
  value-last and curryable by arity, as `/result`'s combinators are.
- `recover(fallback, result)` and `recoverWith(fallback, diagnose, result)`
  take a `Result` in. A Success is itself, with no diagnostic. A Failure is
  `fallback`, with the error as the one diagnostic (`recover`) or with
  `diagnose(error)` (`recoverWith`).
- `toResult(toError, box)` takes a `BestEffort` out: a Success of the value
  when the list is empty, else a Failure of `toError(list)`, handed the whole
  list. It has no predicate.
- `map`'s callback may not return a `BestEffort`; use `andThen`. `toResult`
  refuses a `BestEffort`-valued `T`, and a `T` that may be an `Error`, as
  `success` does.

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

Node 20 or newer, TypeScript 5.4 or newer (`success` and `failure` use
`NoInfer`), and a TypeScript `lib` that includes `DOM` **or**
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
`Error.prototype` being on the value's prototype chain (a value whose chain
cannot be read, such as a hostile Proxy, counts as not an `Error`), with no
wrapper object allocated.

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
prototype-chain discrimination cannot be fooled by a success value that
merely happens to be Error-shaped.

### Declaration emit and an object spread or rest of a `Success` or a `Failure`

A consumer with `declaration: true` can emit its own `.d.ts` for a function
that returns a `Success` narrowed with `typeof` or `in`, or a `Failure`
narrowed with `instanceof` or `in`; `test/declaration-emit/result.test.ts`
pins these. An object spread of a `Success` or a `Failure`, and an object
rest destructuring of a `Success` or a `Failure`, are still open. Each of
these fails with TS4023 or TS4058 ("has or is using name '_phantom' … but
cannot be named"):

```ts
class Invalid extends Error {
  readonly code = 'invalid' as const
}
declare const record: Result<{ id: string }, Invalid>

export const copy = { ...success({ id: 'x' }) }
export function withExtra() {
  if (isSuccess(record)) return { ...record, extra: 1 }
}
export const spreadError = { ...failure(new Invalid()) }
export function rest() {
  if (isSuccess(record)) {
    const { id, ...others } = record
    return { id, others }
  }
}
export function restOfError() {
  if (isFailure(record)) {
    const { code, ...others } = record
    return { code, others }
  }
}
```

Give the exported value or function an explicit type, and each emits:
`export const copy: { id: string } = { ...success({ id: 'x' }) }`. A spread
`Failure` is a plain object at run time, not an `Error`:
`{ ...new Invalid('bad') }` is `{ code: 'invalid' }`, because a spread copies
only own enumerable properties and an Error's `message`, `stack` and `cause`
are not enumerable. Annotate it with the subclass's own fields
(`{ readonly code: 'invalid' }`), not with `Error` or `message`. The same
file pins each case in a test named "still fails with TS4023 or TS4058,
naming a marker symbol" and each workaround in "emits with an explicit type
on the exported value"; a later fix flips the first.

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
