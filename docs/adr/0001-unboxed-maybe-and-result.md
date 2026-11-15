# ADR-0001 — Unboxed Maybe and Result

Date: 2026-08-03. Status: accepted.

## Context

`Maybe<T>` and `Result<T, E>` are both encoded unboxed: a `Just<T>` _is_
the `T`, a `Success<T>` _is_ the `T`, and a `Failure` _is_ the `E`.
Discrimination is a primitive check — `=== undefined` for Maybe,
`instanceof Error` for Result — with no wrapper object ever allocated.
This rationale previously lived only in the consuming project's own
ADR-0016, which does not travel with this library now that it has been
extracted; this ADR records it here as the library's own ground truth.

Two consequences fall out of the encoding, established by probing the
compiler rather than assumed:

- `Maybe<Maybe<T>>` and `Maybe<T>` are mutually assignable — nesting a
  Maybe inside a Maybe is not merely discouraged, it is unrepresentable.
  A `Maybe<U>`-returning callback run through `map` cannot produce an
  observable `Maybe<Maybe<U>>`; it collapses to `Maybe<U>`.
- `Result<Result<T>>` **is** a distinct type, and it is **not**
  assignable back to `Result<T>`. Once a Result nests, it is stuck —
  there is no generic way to un-nest it back to the outer shape.
  A `Maybe<Result<T, E>>` is not a nest of that kind: it reads as
  `Result<T | undefined, E>`, matching the runtime, where `isSuccess(undefined)`
  is true (the 2026-11-15 amendment).

## Decision

- **Keep both Maybe and Result unboxed.** It makes both types nearly
  free to pass across a boundary, and a value that is already a `T`
  needs no unwrapping at the point of use.
- **No `all`/`sequence`.** Generic fan-in combinators need a real
  container to accumulate into, and casts to move between that
  container and the unboxed representation would erode the static
  guarantee that a `Success` can never be an `Error`. Fan-in
  constructors are expected to use `tryCatch` over throwing code
  instead, not a Maybe/Result combinator kit.
- **No Maybe analogue of `tryCatch`.** `tryCatch` exists to lift a
  _throwing_ function into a `Result`. A `Maybe`-producing operation
  doesn't throw to signal absence — it returns `undefined`, which is
  already the `Maybe` encoding directly. There is nothing left for a
  Maybe `tryCatch` to lift.
- **`andThen` over `flatMap`, because nothing ever flattens.** The
  original name (`flatMap`, paired with an explicit `flatten`) implied a
  real flattening step. Since `Maybe<Maybe<T>>` **is** `Maybe<T>`,
  `flatten` was provably an identity function and was deleted, and the
  chaining combinator was renamed `andThen` — both to read as "and then
  do this fallible step" and to match `result/andThen`'s name, even
  though the two are not the same kind of function underneath:
  - **`maybe/andThen` is a true alias of `maybe/map`** — the same
    function, in types and at runtime. It exists purely for symmetry
    with `result/andThen`, so generic code written against both modules
    can call `andThen` without caring which one it's holding.
  - **`result/andThen` is _not_ an alias of `result/map`.** Because
    `Result<Result<T>>` is a distinct, stuck type, running a
    `Result`-returning callback through `map` is a trap: it produces a
    real nested value with no way back. `andThen` exists specifically to
    prevent that — `fn` returns a `Result` directly, and `andThen`
    short-circuits before ever calling it if the input already failed.
- **`orElse` eager, `fallback` lazy — in both modules.** Both modules
  offer the same pair: `orElse(defaultValue)` substitutes a precomputed
  default; `fallback(fn)` computes the default lazily, only when the
  input is absent or failed. Same naming and the same eagerness
  convention in both, so a reader who knows one module's combinator set
  already knows the other's.
- **A bridge in each direction, kept free of a runtime cycle.**
  `maybe/fromResult` discards the error to turn a `Result` into a
  `Maybe`; `result/fromMaybe` takes an error to turn a `Maybe` into a
  `Result`. The two modules import each other's _types_ only (`import
type`, erased entirely at emit by `verbatimModuleSyntax`), and each
  bridge's runtime check is an inlined primitive (`value instanceof
Error`, `value === undefined`) rather than a call to the other module's
  `isSuccess`/`isNothing` guard — calling those across the boundary
  would create a real runtime import cycle. This is maintained by
  convention, not enforced: nothing in `pnpm check` or CI builds and
  inspects the emitted output, so a contributor who "tidies" a bridge by
  importing the other module's guard as a value would create the cycle
  silently, with every existing check still passing. Both bridge
  functions carry an inline comment saying so, next to the check itself.

## Consequences

- The unboxed encoding stays load-bearing and un-fought: no
  `all`/`sequence`/`traverseMaybe` primitives, now or for as long as the
  encoding holds.
- `maybe` and `result` present a matching combinator surface
  (`map`/`andThen`, `orElse`/`fallback`, and a bridge each way) without
  actually sharing an implementation underneath — the asymmetry between
  `maybe/andThen` (an alias) and `result/andThen` (a distinct function)
  is a documented trap, not an oversight, and both docblocks say so
  explicitly.
- `dist/maybe/index.js` and `dist/result/index.js` stay free of runtime
  imports of each other, by convention rather than an automated gate:
  each bridge's inlined runtime check is what keeps it that way, not a
  build step that verifies it. Confirming it means building and running
  `grep -n "^import" dist/maybe/index.js dist/result/index.js` by hand.

## Amendments

### 2026-08-04 — `Success`'s error phantom is invariant in `E`; accepted as a known sharp edge (#17)

**Update, 2026-11-14:** reversed by the amendment below (#57). The phantom
was covariant all along, and the cost was the constructors' top-type
defaults; the text here stands as the record of what was believed.

`Success<T, E>` carries `readonly [_phantom]?: E` purely to give `E` a
position in the type — `Success` never holds an `Error` value, so nothing
else in its shape mentions `E` at all. That phantom makes `Success`
(and therefore `Result`) invariant in `E`: a `Success<T, Error>` is not
assignable to `Success<T, Invalid>` even when `Invalid extends Error`, so
code that constructs a `Result` at a call site typed to a narrower error
class has to spell it out:

```ts
class Invalid extends Error {
  readonly code = 'invalid' as const
}

const step: (n: number) => Result<number, Invalid> = (n) => success(n * 2)
// Type 'Success<number, Error>' is not assignable to type 'Result<number, Invalid>'.
//   Types of property '[_phantom]' are incompatible.

const step: (n: number) => Result<number, Invalid> = (n) =>
  success<number, Invalid>(n * 2) // works
```

(An `Invalid` with no added members doesn't trigger this — TypeScript
treats it as structurally identical to `Error`. It takes a distinguishing
field, which is the common case for a real domain error.)

**This is not unsound.** The same invariance that produces the annotation
burden also rejects a plain `Error` masquerading as `Invalid`, which is the
property the phantom exists to enforce — confirmed by probing the compiler
directly rather than assumed.

**Decision: keep the phantom, accept the annotation as a sharp edge.**
Two things were checked, not assumed, before settling this:

- The annotation is now rare. It used to be the workaround for `andThen`
  collapsing chained inference to `unknown`; that was fixed separately, so
  ordinary `map`/`andThen` chains infer the narrower error type on their
  own. The phantom only bites when a `Result`/`Success`/`Failure` is
  constructed directly at a site typed to an error class narrower than the
  constructor call's own default.
- Dropping the phantom does not buy as much as it looks like. Measured by
  editing a copy of `Success`'s definition, emitting declarations, and
  running the full test suite against it: `Success<Result<T, E>, E>` does
  become mutually assignable with `Success<T, E>` — a real, if narrow,
  collapse — but `Failure` carries its own separate `[_phantom]?: T`
  marker, so the ADR's core invariant (`Result<Result<T>>` is not
  assignable back to `Result<T>`) survives untouched, and every existing
  type-level test — including the one encoding `map`'s nesting trap — stays
  green. `andThen`'s distinctness from `map` doesn't depend on this
  phantom either; that guard runs through `NotAResult`, `ValueOf`, and
  `ErrorOf`, none of which read `Success`'s `E` phantom. On top of that,
  removing the field leaves `E` unused in `Success`'s definition, which
  fails this repo's `noUnusedLocals` — not the clean one-line deletion it
  looks like.

So the fix would touch real type-checking behavior for a case the codebase
rarely hits anymore, in exchange for a partial, narrow relaxation. Not
worth it before 1.0. No code changes as a result of this amendment — call
sites that hit this still need an explicit `success<T, E>(...)` /
`failure<E, T>(...)` / `result<T, E>(...)` annotation when constructing a
`Result` typed to an error class narrower than the constructor's own
inference would produce. (`failure` binds the error first — its parameter
order was deliberately reversed from the other two; see the constructor
docblocks.)

### 2026-11-14 — The #17 amendment is reversed: the constructors drop their top-type defaults (#57)

The 2026-08-04 amendment kept the annotation burden on the grounds that
the annotation was rare and that the phantom's invariance was its cause.
A consumer feedback round (#56) found neither to hold. Consumers do not
chain with `map`/`andThen`; they write early returns, and that is where
the cost lands: zinbow carries 261 `failure<E, T>(…)` and 127
`success<T, E>(…)` sites, 92 of them re-wrapping an already-narrowed
failure only to change its phantom `T`, and has made the annotation a
project rule. over-and-out has the same pattern. slider avoids it by
never narrowing `E`, so its typed errors go unused.

A probe (`prototypes/57/`, measured on TypeScript 5.9.3, 6.0.3 and 7.0.2)
corrects the diagnosis. The phantom was never invariant: `readonly
[_phantom]?: E` is covariant, so a `Success<number, Invalid>` is
assignable to a `Success<number, Error>` and only the narrowing direction
is rejected. The cost comes from the constructors' top-type defaults,
`E = Error` on `success` and `T = unknown` on `failure`, meeting that
covariant phantom: every call without type arguments takes the default,
and a `Success<number, Error>` cannot narrow into a `Result<number,
Invalid>`, so the caller has to say `Invalid` by hand. A `Success`
carries no error, so its honest error type is `never`, and `Success<T,
never>` is assignable to every `Result<T, E>`; likewise a `Failure`
carries no value. With `never` defaults and `NoInfer` on the phantom
position, the phantom stays, stays covariant, and stops costing anything
in the cases consumers actually write:

```ts
success<T extends NotPossiblyAnError<T>, E extends Error = never>(value: T): Success<T, NoInfer<E>>
failure<E extends Error, T = never>(error: E): Failure<NoInfer<T>, E>
```

`NoInfer` is what keeps the default: without it TypeScript infers `E`
from the return position and lands on `Error` at every site typed to a
`Result`, whatever its error type, so the annotation is back.

`NotPossiblyAnError<T>` is `success`'s guard, decided in review round 4
over a conservative `E = ErrorArmOf<T>` default. With `E = never`, a
`success` of a value whose type can hold an `Error` would label it a
`Success` at a site typed to a narrower error class: `success(caught)`
with `caught: unknown`, `success(o)` with `o: object`, `success(x)` with
`x: number | Error`, `success(ro)` with `ro: Result<number, Other>`, and
`success(result(x))`, each of which the old `E = Error` default rejected
only because it forced every unannotated `Success` to carry `Error`. The
guard rejects, with a message naming `result()` as the fix, every `T`
the type system can see may hold an `Error`: a union with an `Error`
member, a `Result` or a `Failure`; a type the empty object fits
(`unknown`, `object`, `{}`, an all-optional object such as
`Partial<Config>`, an index-signature type such as `Record<string,
number>`, a dictionary or a JSON type, and any union of one of those
with a primitive, `null` or `undefined`, since `{} extends T`
distributes over nothing and reads the union whole); and a type a plain
`Error` fits (`{ message: string }`), which includes a class whose
members are all ones a plain `Error` has (`class Tag {
constructor(readonly name: string) {} }`) and the bare shape `{ name:
string }`. It lets through, with no type arguments, a class instance, an
array or a DTO with a member no plain `Error` has, a primitive,
`undefined` and `void`, which is where the consumer cost sat (every
sampled `success` site wraps a domain object; the conservative default
would have kept all of them annotated). Its costs are on record. **Known
sharp edge:** an object type that only an `Error` _subclass_ fits
structurally cannot be told from a safe object and passes: a plain
interface (`{ code: string }` holding an `Other`), a DTO with required
members, a class instance without private members (a `Game { id; round
}` holding a `Sneaky extends Error { id; round }`). `success` still
trusts its caller there. `any` passes too, as it passes every
constraint. **Breaking:** the guard judges the value's type at every
call, not only at a site typed to a narrower error class, so `success`
of any value whose type it judges may hold an `Error` (`unknown`,
`object`, `{}`, an all-optional object, an `Error` union, a `Result`, a
class like `Tag` or the shape `{ name: string }`, an index-signature
type such as `Record<string, number>`) no longer compiles anywhere it
did, with or without a target type and with or without explicit type
arguments: `(p: Partial<Config>): Result<Partial<Config>> => success(p)`
is now an error. So is `success` of an unresolved type parameter
(constrained or not), which cannot be judged. Such code casts, or wraps
with `result()`; four library-internal sites bypass the guard (`orElse`,
`fromMaybe`, `promise/state` and `promise/resultify`, which passes
`success` itself as the fulfilment handler). Further changes:
`failure<E>(e)` now has phantom `T = never` where it had `unknown`; the
one-type-argument `result<X>(v)` binds the new overload, so
`result<number>(5)` is `Result<number, never>` and `result<number |
Invalid>(x)` is `Result<number, Invalid>`; `success(x)` is now
`Success<T, never>` where it was `Success<T, Error>`; and a variable
seeded by an unannotated `failure(e)`, `success(x)` or
`result(primitive)` takes the narrower type and rejects a later wider
assignment (`let last = failure(new Invalid())`, then `last = s` with
`s: Failure<number, Invalid>`, and `let s = success(n)` with `n:
number`, then `s = x` with `x: Success<number, Invalid>`, no longer
compile; annotate the variable). The guard's type, `NotPossiblyAnError`, is exported so its
message can be pinned, as `NotAResult`'s is: it joins the README's
module table, the `/result` surface test and the CHANGELOG.

`Success` gains a third marker, `readonly [_error]?: never`, next to its
`[_phantom]` and `[_value]`. Without it the `never` default opens a hole
the old `unknown` default happened to cover: `Failure<never, Error>` has
`[_phantom]?: never`, which fits `Success<unknown, Invalid>`'s
`[_phantom]?: Invalid`, and an Error object satisfies any `T` that admits
an object, so `(): Result<unknown, Invalid> => failure(new Error())` would
compile. Every `Failure` carries `[_error]?: E`, which `never` refuses, so
no Failure can pass as a Success whatever `T` is. **Update, 2026-11-15:**
a nullish arm of `Success` has no `[_error]`; see the 2026-11-15
amendment below.

`result` has a different shape of cost: a union argument lands wholly in
`T` and `E` defaults to `Error`. It gains a first overload that splits
the argument, keeping the two-parameter signature for explicit calls:

```ts
type ErrorArmOf<V> = V extends Error
  ? V
  : V extends string | number | boolean | bigint | symbol | null | undefined
    ? never
    : Error

result<V>(value: V): Result<Exclude<V, Error>, ErrorArmOf<V>>
```

`ErrorArmOf` is load-bearing, and conservative by decision (review round
4); `unknown` and `any` need no clause of their own: `unknown` falls
through to `Error`, and `any` stays `any`. A plain `Extract<V, Error>`
is `never` for every type a plain `Error` is assignable to without being
one (`unknown`, `object`, `{}`, a narrowed `catch` binding), and so is
any rule that asks whether `Error` fits the member: `{ code: string }`
admits no plain `Error`, yet an `Error` subclass with a `code` fits it,
so a value of that type may be an `Error` at runtime. Dropping the arm
there would label `result(hidden)` a pure `Success` and let it pass
where `Result<{ code: string }, Invalid>` is required, which the old
signature rejects. The only sound rule from the input type alone keeps
an `Error` arm for every non-primitive member and drops it only for
members that provably hold no `Error`: primitives, branded or not,
`null` and `undefined`. So `result(u)` with `u: number | Invalid |
Other` is `Result<number, Invalid | Other>`, `result(email)` with a
branded string is `Result<Email, never>`, `result(o)` with `o: object`
or `{ code: string }` keeps `Error` in its arm as on the old signature,
and `result(new Error())` is `Failure<never, Error>`. For an
object-valued `result()` call at a site typed to a narrower error class
the annotation therefore stays; no consumer in the sample writes one.

`NoInfer` needs TypeScript 5.4 or later. `src/` uses nothing newer than
that today and the package declares no TypeScript range, so the
implementation's CHANGELOG entry and the README's Requirements section
state the floor.

The Result Box's `from` takes the same overload, so the parity between
`from` and `result()` that the Box tests pin survives: measured with the
overload on `Result.from`, the parity test is green and two Box
expectations move, `Result.from(0)` (now `E = never`) and `from` handed
a whole `Result<BoxUser, InvalidUser>` (now `Result<Success<BoxUser,
InvalidUser>, Error | Failure<BoxUser, InvalidUser>>`: the object-valued
`Success` arm keeps `Error` under the conservative arm, and the result
is not assignable to the flat `Result`, so `box` keeps its job for
object values); `from` of an object raw value keeps `Error` and does not
move. For a primitive-valued `Result` the picture differs:
`result(nested)` with `nested: Result<Result<number, Invalid>, Invalid>`
is `Result<number, Invalid>`, assignable to the flat type, where the old
signature rejected it; the nesting invariant itself is untouched
(`Result<Result<T>>` is still not assignable to `Result<T>`), only the
overload's output for a primitive flattens. That primitive/object split
is the premise #89 starts from. With the two in `index.test-d.ts`, four
expectations move. `ErrorArmOf` is module-private to `/result`, so it
goes to `./internal.ts` for `box.ts` to share. The overload breaks a
different promise: `box`'s docblock said a raw non-Result value
"degrades to exactly `from`'s behaviour". For an object raw value it
still does (`Result.box({ id: 'x' })` and `Result.from({ id: 'x' })` are
both `Result<{ id: string }, Error>`); for a primitive it no longer does
(`Result.from(5)` is `Result<number, never>` where `Result.box(5)` is
`Result<5, Error>`); and `Result.box(null)` and `Result.box(undefined)`
do not compile. **Update, 2026-11-15:** they compile since #93; see the
2026-11-15 amendment below. Which of the two promises `box` keeps is not decided
here; it goes to the implementation task and to the Box implementation
(#89), under docs/adr/0005-box-classes.md. These statements were
superseded by this amendment and are corrected in the implementation
(#88): ADR 0005's "`Result.success` seeds `E = never`, the one
deliberately divergent default", its margin note 5 (a plain `success(0)`
seed no longer rides an `Error` arm) and its margin note 9
(`from(resultInHand)` now degrades to a nested `Result<Success<…>,
Failure<…>>`, not to a phantom `Error`); `src/result/box.ts`'s
`Result.success` docblock ("unlike `result/success`, whose default is
`Error`") and `Result.from` docblock ("degrades the error arm to a
phantom `Error`"); the comments and the test title "E defaults to never,
unlike result/success" in `src/result/box.test-d.ts` on the parity test,
the `success` seed and the soft trap;
`docs/migration/0.1.0-to-0.3.0.md`'s "invariant `E` phantom"; and the
0.4.0 `definePrimitiveValueObject` docblock, which points at the
reversed amendment; so are the test comments at
`src/domain/index.test.ts:53-56` ("Success's E phantom is invariant")
and `src/value-object/index.test-d.ts:24-25`. `Result.failure` keeps `T
= unknown` where `failure` moves to `T = never`, and `Result.success`
has no guard (`Result.success(caught)` with `caught: unknown` unboxes
into `Result<unknown, Invalid>` on the old and the new signatures
alike); both are for the implementation task and #89.

Under these signatures, with no type arguments, all of the following
compile (each is a probe in `prototypes/57/probe.test-d.ts`): `(n):
Result<number, Invalid> => success(n)`, `(): Result<number, Invalid |
Other> => failure(new Invalid())`, `(x: number | Invalid):
Result<number, Invalid> => result(x)`, and `if (isFailure(r)) return
failure(r)` into a `Result` with a different `T`. Both guarantees hold
for the three constructors, except through `success()` of a value whose
object type only an `Error` subclass fits (the sharp edge above),
checked rather than assumed. (The combinators are out of this
amendment's scope: `orElse(caught, r)`, `map(() => caught, r)` and
`fromMaybe(new Invalid(), caught)` with `caught: unknown` type-check
into `Result<unknown, Invalid>` on the old signatures as well as the new
ones, and so do the two lifts that bypass the guard: `resultify(() =>
failure(new Invalid()), pu)` with `pu: Promise<unknown>`,
`call/resultify` likewise, and `tryCatch((): unknown => caught,
catchOnly(Invalid))`.) A plain `Error` is still rejected where `Invalid`
is expected, through `failure`, through `result` of a union, of an
`unknown` value, of an `object` or narrowed `catch` binding and of an
object type an `Error` subclass could hide in, through `success` of an
`unknown`, `object`, all-optional, `Error`-union or `Result` value,
through a bare `Failure<_, Error>`, and, through `failure`, at a target
whose `T` is `unknown`, `object`, `{}` or an all-optional object; and
`Result<Result<T>>` is still not assignable to `Result<T>`. The residual
no type can close, as before: a raw `Error` returned without `failure()`
compiles where `T` is `object`, a union with `object`, or an object type
whose required members a plain `Error` has (`Result<object, Invalid>`,
`Result<{ name: string }, Invalid>`, `Result<number | object,
Invalid>`). Where `T` is `unknown`, `{}` or an all-optional object the raw
return is rejected, on 0.4.0 as now, by weak-type detection on
`Success`'s optional markers. Every existing type-level test stays green but two,
whose expectations change from `Success<number, Error>` to
`Success<number, never>` and from `Failure<unknown, Invalid>` to
`Failure<never, Invalid>`, plus the Box `from` expectations the overload
moves.

**Decision: reverse the 2026-08-04 amendment.** The phantom is kept, and
the annotation is no longer accepted as a sharp edge: the constructors
will take the signatures above, in the implementation task that follows
this amendment. Explicit type arguments remain allowed and, at a concrete
`T` the guard passes, keep compiling; the breaking cases are the ones
named above (`success` of any value the guard judges may hold an
`Error`, at any site; `success` of an unresolved type parameter;
`failure<E>(e)`'s phantom; the one-type-argument `result<X>(v)`;
`success(x)`'s inferred `E`, now `never`; a variable seeded by an
unannotated `failure(e)`, `success(x)` or `result(primitive)`), and the
CHANGELOG marks each **Breaking:**, as 0.4.0's does.

Two things were ruled out on the way:

- **Returning a narrowed failure as-is** (`if (isFailure(r)) return r`
  into a `Result` with a different `T`) is not achievable. Narrowing
  `isFailure` to `Failure<never, E>` (`prototypes/57/arm-b1.patch`)
  breaks its false branch, because TypeScript removes only constituents
  that are subtypes of the narrowed type and `Failure<T, E>` is not one.
  Dropping `Failure`'s `[_phantom]?: T` (`arm-b.patch`) makes
  `Result<Result<T>>` assignable to `Result<T>`: `Success`'s
  `[_value]?: T` handle cannot hold the invariant alone, since
  `Success<Result<T>>` intersects the inner `Success<T>`'s handle and an
  intersection is assignable to either side. The invariant is held by
  `Failure`'s phantom `T` and nothing else, so that phantom stays. The
  same site is `return failure(r)`, which needs no type arguments.
- **`definePrimitiveValueObject` inferring `E` from `errorHandler`** was
  never blocked by the phantom. `definePrimitiveValueObject<Email>(…)`
  names `T`, and TypeScript never infers the type parameters a partial
  list leaves out; they take their defaults. With no type arguments at
  all, `T`, `P` and `E` all infer for a handler that returns a bare
  `Error`, on the old signatures as well; a handler written with
  `failure()` or `result()` infers wrong or fails on the old signatures
  and infers under the new ones (probed). The 0.4.0 docblock tells users
  to name `T, P, E` for handwritten handlers; the implementation of this
  amendment drops that instruction and corrects the diagnosis.

### 2026-11-15 — `Success` keeps `null`, `undefined` and `void` as arms of its own (#93)

`Success<T, E>` was `(T extends Error ? never : T) & { markers }`, and an
object type intersected with `undefined` or `null` is `never`. So
`Success<undefined, E>` and `Success<null, E>` were `never`, and two
things followed that the 2026-11-14 amendment's guarantees did not cover,
because neither is a way for an `Error` into a `Success`; the review of
#88 found them, and both exist on 0.4.0 as well:

- `success(undefined)` and `success(null)` were typed `never`, which
  assigns to anything: `(): Result<User, Invalid> => success(undefined)`
  compiled.
- The Success arm of `Result<number | undefined, E>` lost its
  `undefined`: `!isFailure(r)` narrowed to `number`, and the branch that
  handles the `undefined` value was typed unreachable.

`Result<undefined, E>` was likewise its `Failure` arm alone.

**Decision: distribute the markers over the non-nullish part of `T`, and
let the nullish part stand for itself.**

```ts
type Success<T, E extends Error = Error> =
  SuccessArm<T, E> | NoInfer<Extract<T, null | undefined | void>>

type SuccessArm<T, E extends Error> = Exclude<
  T,
  Error | null | undefined | void
> & {
  readonly [_phantom]?: E
  readonly [_value]?: T
  readonly [_error]?: never
}
```

`SuccessArm` is the marked part of a `Success`: an exported alias of its
own, in `/result`'s module table and surface test. It has to be a named
export for two reasons, both measured. Written inline in a union, the
`Success` alias is erased once `Result` flattens, and inference falls back
to the optional `[_phantom]?: E`, so `success(1)` stopped seeding `E =
never` through a generic: `andThen(validate, success(1))` and `map(f,
success(1))` no longer fitted a `Result<_, Invalid>`, which is the
consumer case the 2026-11-14 amendment exists for. And a consumer that
exports a value typed through it, with `declaration` on, failed with
TS4023 or TS4058 ("cannot be named" for `_phantom`, `_value` and
`_error`) unless the arm is reachable through an exported name.

`void` joins the nullish set so that `Result<void, E>`, a common return
type, accepts `success(undefined)`: `undefined` is not assignable to
`void & { … }` (measured; with `void` left out that line failed to
compile). The second arm needs `NoInfer`: written plainly, `T` sits in
the true branch of a conditional, and TypeScript infers a `Failure` into
it, so `resultify(catchOnly(A, B), promise)` bound `O` to the error class
(measured; the first form of this change broke several existing
expectations that way). `NoInfer` is already required (5.4).

The markers keep the whole `T` in `[_value]`, but inference from that
optional marker drops `undefined`: a `Result<number | undefined, E>` read
through `ValueOf` or inferred into `T` yields the `undefined` from the
bare arm, not from the marker. One consequence is a stub's, and it is
fine: the curried `act` (`Result<T, E> & A`, in `src/result/act.ts`) takes
a `(x: Result<Maybe<number>, Invalid>) => …` callback and a `Maybe<number>`
as before, pinned in `nullish-success.test-d.ts`.

Costs, on record. A nullish arm carries no phantom, so `Success<undefined,
Invalid>` and `Success<undefined, Other>` are the same type, `undefined`;
the error arm of a `Result<undefined, E>` is still its `Failure<_, E>`,
which the phantom keeps distinct. Three consequences are observable:

- `success(undefined)` and `success(null)` seed no `E = never` into a
  chain: `map(f, success(undefined))` is `Result<number, Error>`, so a
  `Result<number, Invalid>` annotation on that call does not compile.
  Annotate the call or the callback's error type.
- `unknown` gets no nullish arm, since `Extract<unknown, null | undefined>`
  is `never`, so `success(undefined)` and `success(null)` no longer fit a
  `Result<unknown, Invalid>`, though they did on 0.4.0. Narrowing a
  `Result<unknown, E>` and testing `=== undefined` still gives `never`, as
  before. No clean fix exists: an `unknown extends T ? …` branch breaks
  `map` and `andThen`.
- The error guarantee below now holds for a nullish arm for a different
  reason: a nullish arm has no `[_error]` marker to refuse a `Failure`
  with, but a `Failure` is an object, so it is never `null` or `undefined`.

Measured against the ADR's two guarantees and the standing probes, on
TypeScript 5.4.5, 5.9.3 and 7.0.2:

- A `Success` can never be an `Error`: `Success<Invalid | undefined,
Other>` is `undefined`, `Success<Invalid, Other>` is `never`, no `Error`
  and no `Failure` is assignable to `Success<number | undefined, E>`, and
  the `success` guard (`NotPossiblyAnError`) is untouched.
- `Result<Result<T>>` is still not assignable to `Result<T>`, for a `T`
  with and without a nullish member. A `Maybe<Result<T, E>>` reads as
  `Result<T | undefined, E>`, which matches the runtime, where
  `isSuccess(undefined)` is true.
- Every earlier type test passes unchanged except two Box pins, below.

New behaviour, each pinned in `src/result/nullish-success.test-d.ts`:

- `success(undefined)` is `undefined`, `success(null)` is `null`, and
  neither fits `Result<User, E>`, `Result<null, E>` (for `undefined`) or
  `Result<undefined, E>` (for `null`); each fits a `Result` whose value
  type admits it (`Result<User | undefined, E>`, `Result<void, E>`).
- `!isFailure(r)` on a `Result<number | undefined, E>` narrows to `number |
undefined`, and `Result<undefined, E>` is `undefined | Failure<undefined,
E>`.
- **Breaking, and the most common new compile error:** with `r:
Result<number | undefined, E>`, `map((n: number) => n * 2, r)` and
  `andThen((n: number) => success(n), r)` are now errors. The `undefined`
  value used to be lost from the Success arm, so the callback compiled; it
  now reaches a callback that cannot take it, which is the point. Annotate
  the callback `(n: number | undefined)`, or handle the `undefined` first.
- The Result Box's `box(null)` and `box(undefined)` pins moved: the two
  lines that said they do not compile now compile, as `Result<null, Error>`
  and `Result<undefined, Error>`, the primitive rule of #89 (a primitive
  keeps `Error` through `box`). That decision stays #89's; the
  docblock on `ResultBox.box` is corrected to say what compiles.

A consumer declaration-emit check, `test/declaration-emit/result.test.ts`,
compiles a file that exports `success(1)`, `success(undefined)`, a function
returning `success(n)` or `failure(e)` and a value narrowed by `isSuccess`,
with `declaration` on and `skipLibCheck` off, and expects no TS4023 or
TS4058.
