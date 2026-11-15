# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Upgrading from 0.4.0: `success`, `failure` and `result` no longer need type
arguments in early-return code, and several calls that compiled now do not.
The **Breaking** entries below list each; TypeScript 5.4 or later is required.

- `success(x)`, `failure(e)` and `result(x)` now infer at a site typed to a
  narrower `Result`: `(n: number): Result<number, Invalid> => success(n)`,
  `(): Result<number, A | B> => failure(new A())` and `(x: number | Invalid):
Result<number, Invalid> => result(x)` compile with no type arguments. A
  `Success` carries `E = never` and a `Failure` carries `T = never`, and both
  flow into any `Result<T, E>`. A plain `Error` is still rejected, through
  `failure`, `result` and `success`, where a narrower class is expected, and
  `Result<Result<T>>` is still not assignable to `Result<T>`. A raw `Error`
  returned without `failure()` still compiles where `T` is `object`, a union
  with `object`, an object type whose required members a plain `Error` has
  (`{ name: string }`), an all-optional object with a key `Error` has, typed
  so that `Error`'s member fits (`name`, `message`, `stack`, `cause`:
  `{ name?: string }`, `Partial<{ name: string; port: number }>`), `Object`,
  an `any`-indexed object (`Record<string, any>`, `{ [k: string]: any }`), an
  intersection with `object` (`{ id?: string } & object`), `any` (as `T` or
  as the returned expression), a raw `Error` subclass that fits a member type
  (an `Other` into `Result<{ code: string }, Invalid>`) or a union with any
  of these (`number | { name?: string }`), as before. `unknown`, `{}`,
  `Record<string, unknown>` and an all-optional object with no such key
  (`{ id?: string }`, `{ name?: number }`) reject it. A `void`-typed
  expression also compiles where `T` admits `void`, since the `void` arm
  below: `(f: () => void): Result<void, Invalid> => f()`.
- **Breaking:** `Success<undefined>`, `Success<null>` and `Success<void>` no
  longer reduce to `never`; each is the bare `undefined`, `null` or `void`,
  with no error phantom, and a nullish member of `T` is a Success arm of its
  own. So `success(undefined)` and `success(null)` are no longer assignable to
  every `Result`: `(): Result<User, Invalid> => success(undefined)` is now an
  error, while `Result<User | undefined, Invalid>`, `Result<void, Invalid>`
  and `Result<undefined, Invalid>` accept it. Narrowing a
  `Result<number | undefined, E>` with `!isFailure` or `isSuccess` keeps the
  `undefined` (it narrowed to `number` before, so the branch handling
  `undefined` was typed unreachable), and `Result<undefined, E>` is
  `undefined | Failure<undefined, E>` where it was the `Failure` alone.
  With `r: Result<number | undefined, E>`, `map((n: number) => n * 2, r)` and
  `andThen((n: number) => success(n), r)` are now errors, since the
  `undefined` reaches a callback that takes a number: annotate it
  `(n: number | undefined)`, or handle the `undefined` first (for `map` and
  `andThen` only). A nullish arm has
  no error phantom, so `map(f, success(undefined))` is `Result<number, Error>`
  where a value-carrying `success(x)` seeds `E = never`: a chain over
  `success(undefined)` does not reach a narrower `Result`, and neither
  `success<undefined, E>(undefined)` nor a declared seed nor `andThen(f,
success(undefined))` narrows `E`. Pass type arguments to the combinator
  (`map<undefined, number, undefined, Invalid>(f, success(undefined))`), use
  `result<undefined, Invalid>(undefined)`, or cast.
  A `Success` narrowed out of a `Result<number | undefined, E>`
  (`isSuccess(r) && r !== undefined`, `typeof r === 'number'`, `r!`) still
  carries `number | undefined` through a generic: `orElse(0, r)` and your own
  `unwrap<T, E>(x: Result<T, E>): T` no longer give a `number`, and
  `mapError(f, r)` widens back. So does ruling the `undefined` out of the
  whole `Result` first, for `orElse` and `fallback`. Pass type arguments
  (`orElse<number, Invalid>(0, r)`), rebind to a declared
  `Result<number, Invalid>`, or `map((n: number) => n, r)` first. Three
  cases were already errors on 0.4.0, so they are not regressions:
  `fallback(() => 0, r)` on the narrowed arm (its callback was typed
  `never`), `unwrap` after ruling the `undefined` out of the whole `Result`,
  and `unwrap` on a narrowed `string | null`. On TypeScript 7.0 the
  narrowed-arm `unwrap` and `mapError` were errors on 0.4.0 as well.
  `unknown` gets no nullish arm, so `(): Result<unknown, E> =>
success(undefined)` and `success(null)` no longer compile. Checked on
  TypeScript 5.4, 5.9 and 7.0.
- Add `SuccessArm`, the marked part of a `Success`, exported from `/result`:
  consumers whose declarations mention a `Success` need a name to emit.
- **Breaking:** TypeScript 5.4 or later is required, for `NoInfer` on the
  phantom position of `success` and `failure`.
- **Breaking:** `success` rejects, at any site and with or without type
  arguments, a value whose type may be an `Error`, with a message naming
  `result()`: a union with an `Error` member, a `Result` or `Failure`, a type
  the empty object fits (`unknown`, `object`, `{}`, an all-optional object
  such as `Partial<Config>`, an index-signature type such as
  `Record<string, number>`, a dictionary or a JSON type, or a union of one
  with a primitive, `null` or `undefined`) and a type a plain `Error` fits
  (`{ name: string }`, a class such as
  `class Tag { constructor(readonly name: string) {} }`).
  Wrap such a value with `result()`, or cast. Class instances, arrays, DTOs
  with a member no plain `Error` has, primitives and `undefined` pass. An
  object type that only an `Error` subclass fits, `any` and `void` also pass,
  and can hide an `Error`: a `() => Error` is assignable to `() => void`, so
  `(f: () => void): Result<void, Invalid> => success(f())` compiles.
- **Breaking:** `success` of an unresolved type parameter no longer compiles,
  constrained or not; cast, or wrap with `result()`.
- **Breaking:** `success(x)` is now `Success<T, never>`, where it was
  `Success<T, Error>`.
- **Breaking:** a variable seeded by an unannotated `failure(e)`, `success(x)`
  or `result(primitive)` takes the narrower type and rejects a later wider
  assignment: `let last = failure(new Invalid())` followed by `last = s` with
  `s: Failure<number, Invalid>`, and `let s = success(n)` with `n: number`
  followed by `s = x` with `x: Success<number, Invalid>`, no longer compile. Annotate the
  variable.
- **Breaking:** `failure<E>(e)` now has phantom `T = never`, where it had
  `unknown`.
- **Breaking:** the one-type-argument form `result<X>(v)` binds the new
  overload: `result<number>(5)` is `Result<number, never>`,
  `result<number>(x)` with `x: any` is too, and
  `result<number | Invalid>(x)` is `Result<number, Invalid>`.
- `SuccessArm` carries a third marker, `[_error]?: never`, so that no `Failure`
  can pass as a `Success`.
- Add `NotPossiblyAnError`, the type of `success`'s guard, exported from
  `/result`.
- `definePrimitiveValueObject` infers `E` from a handler written with
  `failure()` or `result()`, when it is given no type arguments.
- `catchOnly` and the `tryCatch` class-list shorthand now accept error classes
  with a private constructor, such as a domain error with a static factory.
  Arrow functions, methods, plain objects and constructors of non-`Error`
  instances are rejected at compile time. Calls that compiled before keep
  their inferred error type.
- **Breaking:** `catchOnly` (and so the `tryCatch` shorthand) now throws a
  `TypeError` when the handler is created, if the class list is empty or holds
  an entry that is not a function, or whose inspection throws (a revoked
  proxy, a throwing `Symbol.hasInstance` getter), or that has no custom
  `Symbol.hasInstance`, own or inherited, and either an object `prototype`
  without `Error.prototype` on its chain (`Object`, `Map`, `Symbol`, `Array`,
  `Promise`, `Date`, a class that does not extend `Error`, a function
  declaration, a bound subclass of `Map`), or no object `prototype` and source
  text that does not say `[native code]` (`undefined`, an arrow function, a
  method). Before, an entry with no object `prototype` (`undefined`, an arrow
  function, a method) threw on the error path and replaced the original error,
  so a list holding one (an `undefined` from a circular CommonJS import)
  loaded on 0.4.0 and now throws at creation. `Object` matched every `Error`,
  so `catchOnly(Object)(new TypeError('bug'))` turned a programming bug into a
  Failure; the other entries with a non-Error object `prototype` matched
  nothing and rethrew every error. TypeScript already rejected all of them.
  Still admitted: an `Error` class or an ES5-style error constructor
  (`Legacy.prototype = Object.create(Error.prototype)`), a bound subclass of
  `Error`, a class with a custom `Symbol.hasInstance`, a function from another
  realm, and a function with no `prototype` of type object whose source says
  `[native code]`, such as `Math.max`, `parseInt`, `Function`, or a bound
  `Error`, `Object` or base class (one declared without `extends`): a bound
  `Object` still matches every `Error`. An entry is checked once, at creation. An entry that
  fails inside `instanceof` later, such as a proxy revoked after the handler is
  created, counts as not matching: the original error is rethrown unless a
  later entry matches.
- **Breaking:** `tryCatch` (and so `definePrimitiveValueObject`'s
  `errorHandler`) now throws a `TypeError` when called with a handler that is
  neither an array nor a function, or is a function that is a class (its source
  starts with `class`, an error class or not, so `class {}` and
  `class Foo extends Map {}` too), or whose `prototype` is `Error.prototype` or
  inherits from it (`Error`, `TypeError` and the other built-ins, an ES5-style
  error constructor, a bound subclass of `Error`), or whose inspection throws.
  Before, one was accepted and replaced the original error on the error path.
  TypeScript already rejected all of these. Not detected, though TypeScript
  rejects them: a bound `Error`, which returns a fresh `Error` as the Failure;
  a bound class that is not an `Error` subclass, which throws "cannot be
  invoked without 'new'" on the error path in place of the original error; and
  a built-in or ES5-style error constructor from another realm, which returns
  a foreign error, or `undefined`, as a Success (a foreign
  `class ... extends Error` is refused). A handler bound with
  `handler.bind(ctx)` is accepted.
- When the `instanceof Error` check itself throws, such as for a Proxy whose
  `getPrototypeOf` trap throws, `catchOnly` rethrows the original value and
  the default `tryCatch` handler wraps it in a `ThrownError`. `ThrownError`
  no longer throws while rendering a Proxy whose `get` trap throws.
- **Breaking:** `tryCatch(fn, undefined)` and
  `definePrimitiveValueObject(construct, undefined)` now throw a `TypeError`,
  and `definePrimitiveValueObject(construct, null)` does too. Only an absent
  argument selects the default handler; before, a falsy one silently selected
  the catch-everything default, and so an `undefined` from a circular
  CommonJS import still became catch-everything. Omit the argument, or pass a
  handler. TypeScript already rejected these.
- `promise/fail` wraps a rejection reason in a `RejectionError` when its
  `instanceof Error` check throws (a Proxy whose `getPrototypeOf` trap
  throws), and `maybe/fromResult` keeps such a value as a `Just`. Before, the
  trap's error replaced the reason: `resultify(fail)(Promise.reject(proxy))`
  rejected with it.
- `result/isSuccess`, `isFailure` and `assertSuccess`, and so `map`, `mapError`,
  `fallback`, `orElse` and `andThen`, no longer throw when the Error check
  itself throws (a Proxy whose `getPrototypeOf` trap throws, a revoked Proxy).
  Such a value counts as not an `Error`, as `maybe/fromResult` already treats
  it: `isSuccess` is true for it, `isFailure` false, `assertSuccess` returns it
  rather than throwing, and the combinators treat it as a `Success`. Before,
  the trap's error escaped: `map(x => x, proxy)` threw the trap's `RangeError`.
- The shared Error check behind these, `catchOnly`, the default `tryCatch`
  handler, `maybe/fromResult` and `promise/fail` now asks whether
  `Error.prototype` is on the value's prototype chain (`isPrototypeOf`) instead
  of using `instanceof`, so a defined `Error[Symbol.hasInstance]` is no longer
  consulted. Otherwise a hook that throws made every real `Error` count as not
  an `Error`. The answer is the same for every value without such a hook,
  including an `Error` from another realm (not an `Error`, as before).
- `abort/isAbortError` answers `false` for a value on which its check throws,
  where it threw before: a Proxy whose `getPrototypeOf` trap throws, a revoked
  Proxy, and a Proxy over a real abort whose `name` is read through the proxy
  (no traps, or a `Reflect.get(target, key, receiver)` forwarder), as the
  platform's `name` getter rejects the proxy. A `get` trap that reads `name`
  with the target as receiver still answers `true`.
- `PrimitiveValueObject['from']` is now `readonly` in the type, matching the
  frozen factory: assigning to it no longer typechecks.
- Document that `definePrimitiveValueObject<Email>(construct, catchOnly(...))`
  widens `E` to `Error`; pass no type arguments, or all three.
- The release workflow no longer replaces the asset of a release that is already
  public: a rerun succeeds when the published tarball has the same contents and
  fails when it differs. Only drafts are replaced and then published.
- Pre-release tags (`v1.0.0-rc.1`) are published as pre-releases, and only the
  highest plain version is marked Latest. Release runs for different tags now
  run one at a time.
- The write-scoped release job no longer restores the pnpm cache.
- The README documents the draft release flow, and its Renovate example now
  uses the `github-releases` datasource.

## [0.4.0] - 2026-11-14

Upgrading from 0.3.x: there are two breaking changes, both small.
`InternRegistry` now holds only object values, and `definePrimitiveValueObject`
returns a frozen factory.

- **Breaking:** `InternRegistry<K, V>` now requires `V extends object` and holds
  canonical instances weakly, so instances nothing else holds can be collected.
  Behaviour change: `create` can now run more than once for the same key, and
  `get` can return Nothing for a key that was interned earlier, once its
  instance has been collected.
- **Breaking:** `definePrimitiveValueObject` now returns a frozen factory.
  Its properties, including `.from`, can no longer be replaced or extended.
- Add `result/catchOnly(...ErrorClasses)` and a non-empty class-list shorthand
  for `tryCatch`. Listed errors from this realm become failures; every other
  value is rethrown unchanged, including errors from another realm.
- Version tags now run the CI checks and attach a built tarball to their GitHub
  Release. The workflow checks the tag against the package version, and a rerun
  replaces the existing asset.
- The repository now uses pnpm 12.18.0. The README documents tarball installs,
  Git installs and Renovate.
- Document static Factory checks, callable Primitive Value Object factories,
  validation after JSON parsing, and weak Intern Registry retention.
- The README's install line now points at the built tarball attached to the
  GitHub Release, which installs with no build step. The `github:` form
  still builds through `prepare`, and pnpm 11 refuses that without an allow-list.

## [0.3.0] - 2026-08-04

Upgrading from 0.1.x or 0.2.x? See the
[0.1.0 → 0.3.0 migration guide](./docs/migration/0.1.0-to-0.3.0.md).

- Tests pinning the public API surface of every subpath and the root entry
  point, so an accidentally added, removed or renamed export fails CI
  instead of shipping silently. `scripts/assert-exports-resolve.mjs`
  already proved a declared subpath resolves and imports against the
  built package; it said nothing about which symbols came through it.
  Runtime export names are asserted per subpath in `test/api-surface/*.test.ts`
  (`import * as ns` plus a sorted, inline expected list — a snapshot file
  would hide what actually changed); type-only exports, invisible at
  runtime, are pinned separately in a companion `src/**/api-surface.test-d.ts`
  per module that references every documented exported type, so a removal
  or rename fails typecheck instead. The root entry point additionally
  asserts that `/promise/fake` is unreachable from it, the test-double
  isolation the README already documents. The `test/api-surface/*.test.ts`
  files import from `src/` rather than `dist/`, so the suite runs under
  plain vitest with no build; `assert-exports-resolve` remains the check
  for the built-artifact side. To change the surface intentionally: add,
  remove or rename the export in `src/`, then update the matching pin
  (each pinning file's docblock says which one) and the README's module
  table.
- A root entry point (`"."` in `exports`, plus top-level `main`/`types`
  for tooling that ignores `exports`). It re-exports each module as a
  namespace (`maybe`, `result`, `internRegistry`, `valueObject`, ...), so
  the previously-undocumented bare `import from '@lhellemons/ground-types'`
  now resolves instead of failing with an unhelpful module-resolution
  error, without flattening the modules into one namespace — `maybe.map`
  and `result.map` stay distinct. `/promise/fake` is excluded from the
  root, for the same reason it is a separate subpath in the first place.
  Closes #11.
- **Breaking:** `value-object/PrimitiveValueObject` and
  `domain/DomainObjectFactory` gain an `E extends Error = Error` type
  parameter, so a factory can declare the concrete Failure subclass its
  `.from` reports instead of the two being pinned to plain `Error`. This
  was the gap between the library's own pitch — CONTEXT.md's Failure entry
  says "a Failure keeps its concrete Error subclass, so a caller can branch
  on it" — and a factory that could never express which subclass that was.
  `definePrimitiveValueObject` takes a new optional `errorHandler` argument
  to translate a thrown value into that subclass, mirroring `tryCatch`'s own
  handler-shaped overload split: with no `errorHandler`, `.from` routes
  through `tryCatch`'s handler-less overload and `E` is `Error`; with one,
  it routes through the generic overload and `E` follows the handler. Name
  `E` explicitly alongside `T` when passing an `errorHandler`, since
  `Success`'s invariant `E` phantom (docs/adr/0001, 2026-08-04 amendment)
  keeps TypeScript from reliably inferring `E` from `errorHandler`'s return
  type alone — confirmed by trying inference-only first and watching it
  default back to `Error`. `DomainObjectFactory`'s new `E` sits ahead of the
  existing `TExtra` parameter, both defaulted, so a call site naming neither
  is unaffected and one naming only `TExtra` today needs to start naming `E`
  too (or switch to naming both by position).

- **Breaking:** `definePrimitiveValueObject`'s type parameters are now
  ordered `T, P, E`, matching `PrimitiveValueObject<T, P, E>` exactly,
  reversing the `P, T` order it took before. `P` also now defaults to
  `string` at the function itself, not just on the type. `T` — the
  branded type actually being defined — is what a caller wants to name;
  with `T` first and both `P` and `E` defaulted, the common case is one
  explicit type argument, `definePrimitiveValueObject<Email>(...)`. The
  old order left that same single argument compiling silently as `P`
  instead of `T`, leaving `T` as `unknown` — confirmed by trying it,
  not assumed. A call site naming both type arguments today needs them
  swapped: `definePrimitiveValueObject<P, T>(...)` becomes
  `definePrimitiveValueObject<T, P>(...)`.

- **Breaking:** `domain/DomainObjectDTO` renamed to `domain/DTOSource`.
  The old name and shape disagreed with CONTEXT.md's own DTO entry: a DTO
  is "the plain, untrusted data shape a domain object is constructed from
  and serialised to", but `DomainObjectDTO<TDTO> = { readonly dto: TDTO }`
  was a domain object _carrying_ its DTO, not the DTO itself. `DTOSource`
  names what the type actually is — the other direction of a Factory's
  seam, recovering the DTO a domain object's current values would
  round-trip back through the Factory that built it — and CONTEXT.md
  gains a matching "DTO Source" entry next to Factory. Same shape, same
  signature; only the name changed. A consumer referencing
  `DomainObjectDTO` needs to rename the import and any `implements`/
  `satisfies` clause to `DTOSource`.

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

- **Breaking:** `maybe/map` (and `andThen`, its true alias) now rejects a
  callback whose return type has a thenable arm, exactly as `result/map`
  already did. `map(async (n) => ...)` compiled and produced
  `Maybe<Promise<string>>` — a `Just` that is an unresolved `Promise`,
  present whatever it eventually settles to — because nothing in `/maybe`
  asserted that a value resolves synchronously. The guard is `/result`'s
  own `NotAPromise`, now exported and imported type-only so the
  maybe/result boundary stays free of a runtime cycle, and it surfaces
  the identical diagnostic naming the sanctioned fix: resolve with
  `promise/resultify` or `call/resultify` first, then compose with
  `.then()`.
- `maybe/fromNullable` — the boundary helper for null-convention APIs,
  folding both `null` and `undefined` to `Nothing`. The encoding knows
  exactly one absence — `Nothing` _is_ `undefined` — so to `maybe()` a
  `null` is a value and becomes a `Just`: a trap for the stated boundary
  use-case, since half the platform signals absence with `null`
  (`querySelector`, `RegExp.prototype.exec`, a JSON field). The `null` is
  folded away rather than carried — the return type is
  `Maybe<NonNullable<T>>` — so downstream code never sees a null again
  and the one-absence encoding stays clean. `maybe()` itself is
  unchanged: only `undefined` is Nothing to it.
- **Breaking:** `result/tryCatch` is split into two overloads so its
  default handler is sound. `tryCatch(fn)` fixes `E = Error` — exactly
  what the default handler can honour: the `Error` as thrown, or a
  `ThrownError` around anything else — while `tryCatch(fn, handler)`
  stays generic in `E`, where the handler is the caller's own promise to
  produce that `E`. Under the single signature, `E` could be named
  explicitly with the handler omitted, and the default's documented
  unsound cast then passed a thrown `TypeError` off as
  `Failure<T, MyError>`. That spelling — three type arguments, one value
  argument — no longer matches any overload; supply the handler that
  produces the named error, or drop the type arguments.
- `maybe/Just` and `maybe/Nothing` default their type parameter to
  `unknown`, so the case names can be written bare in an annotation. A
  bare `Nothing` is exactly `undefined`; a bare `Just` is plain `unknown`
  — "present, type unstated" as a reading for humans, since the default
  cannot exclude `undefined` without knowing `T`. `Maybe` deliberately
  keeps its required argument: a bare `Maybe` would evaluate to plain
  `unknown`, an annotation claiming "may be absent" that the checker
  holds you to nothing on.
- **Breaking:** `result/failure`'s type parameters are reordered from
  `<T, E extends Error>` to `<E extends Error, T = unknown>`. The single
  explicit type argument a caller plausibly writes — `failure<MyError>(e)`
  — used to bind the _success_ type, silently yielding
  `Failure<MyError, Error>`: the named error class demoted to plain
  `Error`, with no diagnostic. It now binds the error, and a non-`Error`
  first argument is a compile error rather than a quiet mis-bind. Call
  sites that named both parameters swap them
  (`failure<number, E>` → `failure<E, number>`); call sites with no type
  arguments are unaffected. `success<T, E>` keeps its value-first order —
  the asymmetry is deliberate and documented on both constructors: each
  puts the type its caller actually has in hand first.
- `result/mapError` — `map`'s dual over the failure channel: applies a
  callback to a `Failure`'s `Error` and passes a `Success` through, so a
  factory's error can be translated into the caller's domain error
  _inside_ a chain. Previously the failure channel could only be erased —
  `orElse` and `fallback` both end in a `Success` — while `tryCatch` and
  `resultify`'s handlers could re-fail; the two vocabularies were
  inconsistent. The callback shares those handlers' shape: it returns a
  whole `Result`, so a bare `Error` is pure translation and a `Success`
  recovers, with the inferred error type tracking exactly which arms the
  callback actually has. Curryable like the rest, and guarded by
  `NotAPromise`. `/maybe` deliberately has no counterpart: `Nothing`
  carries nothing to transform.
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

- Docs: an editorial pass over the README and every docblock, harmonizing
  them after the API-coherence batch above. Docblocks now document nature,
  usage and relationships only: motivation and design-rationale prose —
  why an encoding is sound, why a name or parameter order was chosen, why
  an alternative was rejected — is pruned along with history and
  experiment narration ("under the previous order…", "confirmed by trying
  it"); the ADRs and this CHANGELOG keep that record, and a docblock may
  point at an ADR for the why but no longer contains it. Caller-facing
  hazards stay (unhandled-rejection traps, `isAbortError` over
  `instanceof`, synchronous-only callbacks). Drift is also fixed: the
  README module table was missing `intern-registry/internByKey` and
  `promise/TrackedState`, and its Status section credited the unreleased
  `result/mapError` to v0.2.x. No signature, type, or behaviour changes.

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
- `compose` extended from a fixed 2-ary to up to ten Mappers, right to
  left, mirroring `pipe`'s per-arity overload set: every step's parameter
  type is pinned to its neighbour's return type, and an eleventh Mapper is
  a compile error rather than a silent `unknown`. `pipe`'s redesign closed
  #7 for the value-in-hand case; `compose` was still capped at two, which
  recreated the same nesting problem for the deferred, no-value-yet case
  the README already told readers to reach for it for. Non-breaking: every
  existing 2-ary call typechecks and behaves exactly as before.
- `curry` and `CurryableMapper` stay public, with their docblocks rewritten
  to present them as the extension point for a consumer writing their own
  curryable combinator, rather than reading as an implementation detail
  that happens to be exported. `CurryableMapper`'s docblock already said
  its union "is not meant to be narrowed at a call site", and `curry`'s
  said callers must forward arity via a `[] | [T]` rest tuple or the
  mechanism silently breaks — true, but written for a reader who already
  knew what these two were for. Both docblocks now show the same
  three-part shape `promise/resultify` and `call/resultify` already use
  (two overloads, a rest-tuple implementation signature, a body that
  spreads into `curry`), with a worked `scaleBy` example pinned as a
  runtime test in `src/fn/index.test.ts`. No behaviour or signature
  change.

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
