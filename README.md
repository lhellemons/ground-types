# ground-types

Tactical DDD building blocks and the functional primitives they stand
on — Brand, Value Object, Entity, Factory, over Maybe and Result.

A _ground type_ is a type with no free type variables: fully concrete,
standing on nothing further. That is what this library is for — the
groundwork you lay before modelling a domain.

Every term used here is defined in [CONTEXT.md](./CONTEXT.md).

## Install

```sh
pnpm add github:lhellemons/ground-types#semver:^0.2.0
```

Not published to npm yet.

## Modules

Each module is a separate subpath export; there is no root entry point.

| Subpath            | Exports                                                                                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/maybe`           | `Maybe`, `Just`, `Nothing`, `maybe`, `just`, `nothing`, `isJust`, `isNothing`, `orElse`, `fallback`, `map`, `andThen`, `assertJust`, `fromResult`                                                       |
| `/result`          | `Result`, `Success`, `Failure`, `ThrownError`, `NotAResult`, `result`, `success`, `failure`, `isSuccess`, `isFailure`, `tryCatch`, `assertSuccess`, `map`, `fallback`, `orElse`, `andThen`, `fromMaybe` |
| `/brand`           | `Brand`, `Branded`                                                                                                                                                                                      |
| `/value-object`    | `Primitive`, `PrimitiveValueObject`, `definePrimitiveValueObject`                                                                                                                                       |
| `/domain`          | `Entity`, `CompoundValueObject`, `DomainObjectDTO`, `DomainObjectFactory`                                                                                                                               |
| `/intern-registry` | `InternRegistry`                                                                                                                                                                                        |
| `/fn`              | `Fn`, `Mapper`, `CurryableMapper`, `compose`, `pipe`, `curry`, `identity`, `constant`                                                                                                                   |
| `/promise`         | `AbortablePromise`, `AbortContext`, `RejectionError`, `resultify`, `fail`, `recoverWith`, `State` with its constructors and guards, `settledResult`, `stateOf`                                          |
| `/promise/fake`    | `fakePromise`, `fakeAbortablePromise`                                                                                                                                                                   |
| `/call`            | `Call`, `AsyncCall`, `AbortableCall`, `abortable`, `resultify`                                                                                                                                          |
| `/abort`           | `AbortError`, `isAbortError`, `ABORT_ERROR_NAME`                                                                                                                                                        |

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

## Composing a chain of steps

Every `maybe`/`result` combinator takes its configuration and returns a
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
hand yet, use `compose`, which reads right to left instead. See
[docs/adr/0004-pipe-value-first.md](./docs/adr/0004-pipe-value-first.md)
for why `pipe` is shaped this way.

## The asynchrony layer composes with the primitives

There is no `mapAsync`, no `AsyncResult`, and no second combinator set for
asynchronous code. There does not need to be: every `Result` combinator is
a unary function, so `.then` already composes with them.

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

v0.2.x. `maybe` and `result` now offer a matching combinator set — `map`
and `andThen`, eager `orElse` and lazy `fallback`, and a bridge each way
between the two modules (`maybe/fromResult`, `result/fromMaybe`) — and
every export carries a docblock. The names match, but one pair does not:
`maybe/andThen` is a true alias of `maybe/map`, because a `Maybe` cannot
nest, whereas `result/andThen` is genuinely distinct from `result/map`,
because a `Result` can. See
[docs/adr/0001-unboxed-maybe-and-result.md](./docs/adr/0001-unboxed-maybe-and-result.md)
for the rationale behind the encoding and these symmetry choices.

Unreleased on `main`: an asynchrony layer — `/promise`, `/call` and
`/abort` — built on the same primitives, and a `/fn` grown to hold the
whole function vocabulary. Two things to know about it:

- **Abort propagates upstream.** Aborting a promise derived through
  `then` aborts the one it came from, so cancelling the tail of a chain
  really cancels the work at the head. The consequence is that two
  branches off one source can abort each other; `detach()` severs that
  link at a branch point. See
  [docs/adr/0002-abort-propagation.md](./docs/adr/0002-abort-propagation.md).
- **The new modules are curryable, the old ones are not yet.**
  `promise/resultify(fail, promise)` and `promise/resultify(fail)` are
  both valid, while `result/map(fn)` still only returns a function.
  Retrofitting `maybe` and `result` is intended, and recorded in
  [docs/adr/0003-currying.md](./docs/adr/0003-currying.md) rather than
  left as an inconsistency to discover.

Not yet published to npm; expect breaking changes within 0.x.

## Licence

MIT — see [LICENSE](./LICENSE).
