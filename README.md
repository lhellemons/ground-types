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

| Subpath            | Exports                                                                                                                                                                    |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/maybe`           | `Maybe`, `Just`, `Nothing`, `maybe`, `just`, `nothing`, `isJust`, `isNothing`, `orElse`, `fallback`, `map`, `andThen`, `assertJust`, `fromResult`                          |
| `/result`          | `Result`, `Success`, `Failure`, `result`, `success`, `failure`, `isSuccess`, `isFailure`, `tryCatch`, `assertSuccess`, `map`, `fallback`, `orElse`, `andThen`, `fromMaybe` |
| `/brand`           | `Brand`, `Branded`                                                                                                                                                         |
| `/value-object`    | `Primitive`, `PrimitiveValueObject`, `definePrimitiveValueObject`                                                                                                          |
| `/domain`          | `Entity`, `CompoundValueObject`, `DomainObjectDTO`, `DomainObjectFactory`                                                                                                  |
| `/intern-registry` | `InternRegistry`                                                                                                                                                           |
| `/fn`              | `Function`, `compose`                                                                                                                                                      |

```ts
import { andThen, isFailure } from '@lhellemons/ground-types/result'
import type { Branded } from '@lhellemons/ground-types/brand'
import { definePrimitiveValueObject } from '@lhellemons/ground-types/value-object'
```

Modules share a name deliberately: `map` in `/maybe` and `map` in
`/result` are the same idea over different containers. Import per module
rather than flattening them into one namespace.

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
for the rationale behind the encoding and these symmetry choices. Not yet
published to npm; expect breaking changes within 0.x.

## Licence

MIT — see [LICENSE](./LICENSE).
