# ADR-0001 — Unboxed Maybe and Result

Date: 2026-08-03. Status: accepted.

## Context

`Maybe<T>` and `Result<T, E>` are both encoded unboxed: a `Just<T>` _is_
the `T`, a `Success<T>` _is_ the `T`, and a `Failure` _is_ the `E`.
Discrimination is a primitive check — `=== undefined` for Maybe,
`Error.prototype` on the prototype chain for Result — with no wrapper object
ever allocated.
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

**Update, 2026-11-15:** a `Maybe<Result<T, E>>` is not a nest of that kind.
It reads as `Result<T | undefined, E>`, matching the runtime, where
`isSuccess(undefined)` is true (the 2026-11-15 amendment below).

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
  **Update, 2026-11-15:** the ban on a container-based `all`/`sequence`
  stands; fan-in over the unboxed `Result` is `collect` and
  `attempt`/`take`, which need no container, and `tryCatch` over
  `assertSuccess` is no longer the expected idiom. See the 2026-11-15
  amendment below (#59).
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
  bridge's runtime check is a primitive (`Error.prototype` on the value's
  prototype chain, `value === undefined`) rather than a call to the other
  module's `isSuccess`/`isNothing` guard — calling those across the boundary
  would create a real runtime import cycle. This is maintained by
  convention, not enforced: nothing in `pnpm check` or CI builds and
  inspects the emitted output, so a contributor who "tidies" a bridge by
  importing the other module's guard as a value would create the cycle
  silently, with every existing check still passing. Both bridge
  functions carry an inline comment saying so, next to the check itself.
  **Update, 2026-11-15:** since #91 `maybe/fromResult` calls the shared
  module-private `internal/is-error` guard instead of an inlined
  `instanceof`; it is a module of its own, so the boundary stays free of a
  runtime cycle. The guard answers false for a value whose prototype chain
  cannot be read (a Proxy whose `getPrototypeOf` trap throws), which
  `isSuccess`, `isFailure` and `assertSuccess` now use too (#96): such a
  value is a Success. The guard asks whether `Error.prototype` is on the
  chain (`isPrototypeOf`), not `instanceof Error`, so a defined
  `Error[Symbol.hasInstance]` is not consulted. The two answer differently
  when that hook is defined or the global `Error` is replaced after load; the
  guard captures `Error.prototype` when its module loads.

## Consequences

- The unboxed encoding stays load-bearing and un-fought: no
  `all`/`sequence`/`traverseMaybe` primitives, now or for as long as the
  encoding holds. **Update, 2026-11-15:** `collect` and `attempt` (#59)
  are fan-in without a container; see the amendment.
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
array or a DTO with a member no plain `Error` has, a primitive
and `undefined`, which is where the consumer cost sat (every
sampled `success` site wraps a domain object; the conservative default
would have kept all of them annotated). Its costs are on record. **Known
sharp edge:** an object type that only an `Error` _subclass_ fits
structurally cannot be told from a safe object and passes: a plain
interface (`{ code: string }` holding an `Other`), a DTO with required
members, a class instance without private members (a `Game { id; round
}` holding a `Sneaky extends Error { id; round }`). `success` still
trusts its caller there. `any` passes too, as it passes every
constraint. **Update, 2026-11-15:** `void` passes as well and can hide an
`Error`, since a `() => Error` is assignable to a `() => void`:
`(f: () => void): Result<void, Invalid> => success(f())` compiles, and so
does the raw return `(f: () => void): Result<void, Invalid> => f()`, because
`void` has an arm of its own. With an explicit type argument the guard
judges the argument, not the value: `success<{ code: string }>(other)`
compiles where `success(other)` is rejected. The guard's design is
unchanged. **Breaking:** the guard judges the value's type at every
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
compile; annotate the variable). The guard's type, `NotPossiblyAnError`, is
exported so its message can be pinned, as `NotAResult`'s is: it joins the
README's module table, the `/result` surface test and the CHANGELOG.

`Success` gains a third marker, `readonly [_error]?: never`, next to its
`[_phantom]` and `[_value]`. Without it the `never` default opens a hole
the old `unknown` default happened to cover: `Failure<never, Error>` has
`[_phantom]?: never`, which fits `Success<unknown, Invalid>`'s
`[_phantom]?: Invalid`, and an Error object satisfies any `T` that admits
an object, so `(): Result<unknown, Invalid> => failure(new Error())` would
compile. Every `Failure` carries `[_error]?: E`, which `never` refuses, so
no Failure can pass as a Success whatever `T` is. **Update, 2026-11-15:**
a nullish arm of `Success` has no `[_error]`; see the 2026-11-15
amendment below. **Update, 2026-11-16:** the markers are now named by the
exported `SuccessMarkers` and `FailureMarkers` (#99).

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
2026-11-15 amendment below. Which of the two promises `box` keeps is not
decided here; it goes to the implementation task and to the Box implementation
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
no type closes without a cost, as before: a raw `Error` returned without
`failure()` compiles where `T` is `object`, a union with `object`, or an
object type whose required members a plain `Error` has (`Result<object,
Invalid>`, `Result<{ name: string }, Invalid>`, `Result<number | object,
Invalid>`); where `T` is an all-optional object with a key `Error` has,
typed so that `Error`'s member fits (`name`, `message`, `stack`, `cause`:
`Result<{ name?: string }, Invalid>`, `Result<Partial<{ name: string; port:
number }>, Invalid>`, `Result<{ message?: string; id?: number }, Invalid>`),
which passes weak-type detection through that key; where `T` is `Object`, an
`any`-indexed object (`Record<string, any>`, `{ [k: string]: any }`,
`Readonly<Record<string, any>>`) or an intersection with `object`
(`{ id?: string } & object`); where `T` is `any`, or the returned
expression is; where the returned value is an `Error` subclass that fits a
member type (`(o: Other): Result<{ code: string }, Invalid> => o`, and
`{ code?: string }`); and where `T` is a union with any of these members
(`number | { name?: string }`, `number | Record<string, any>`). All of this
compiles on 0.4.0 as well; `void` joins it since 2026-11-15 (see the update
in the guard paragraph above). Three kinds of raw return are rejected, on
0.4.0 as now, each for its own reason. Where `T` is `unknown` or `{}`,
weak-type detection on `Success`'s optional markers rejects it. Where `T` is
an all-optional object with no key in common with `Error` (`Result<{ id?:
string }, Invalid>`), the object's own optional members make the target weak
and reject it the same way. A user sees TS2322 elaborated through the
`Failure` arm for all of these, not TS2559. Where `T` is `Record<string,
unknown>`, `Error` has no index signature; where `T` is `{ name?: number }`,
`Error`'s `name` is a string, and the shared key passes weak-type detection.
Every existing type-level test stays green but two, whose expectations
change from `Success<number, Error>` to `Success<number, never>` and from
`Failure<unknown, Invalid>` to `Failure<never, Invalid>`, plus the Box
`from` expectations the overload moves. **Update, 2026-11-15:** a
`stack?: never` marker on the marked arm would close every structural case
above and leave `any` and `void`, at the cost of every `T` with a `stack`
member; ticket #101 holds that decision, and no type changed for it (ticket
#94).

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

type SuccessArm<T, E extends Error = Error> = Exclude<
  T,
  Error | null | undefined | void
> & {
  readonly [_phantom]?: E
  readonly [_value]?: T
  readonly [_error]?: never
}
```

**Update, 2026-11-16:** the marker object in this block is now the exported
alias `SuccessMarkers<T, E>` (#99), with the same members.

`SuccessArm` is the marked part of a `Success`: an exported alias of its
own, in `/result`'s module table and surface test. It needs a name and an
export, for two reasons, both measured: seeding needs a named alias, and
declaration emit needs the export. Written inline in a union, the
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

The markers keep the whole `T` in `[_value]`. A `Result<number | undefined,
E>` therefore infers `T = number | undefined` from the arm's alias type
argument, as it should; the cost of that is the narrowed-arm case in the
list below. One more consequence is a stub's: the curried `act` overload
(`Result<T, E> & A`, `src/result/act.ts`) does not take a
`Result<Maybe<number>, Invalid>` argument for a callback written over the
same type (TS2345: `T` and `E` infer as `number` and `Error` from the value
and `Invalid` from the parameter at once). That compiled on 0.4.0. The other
half of the change goes the other way: `act` with a callback over
`Result<Maybe<number>, Invalid>`, applied to a `Maybe<number>`, failed
before this amendment and compiles now. `act` is an unexported, unimplemented
stub, so both are pinned in `nullish-success.test-d.ts` and handed to the act
and Box work (#89).

Costs, on record. A nullish arm carries no phantom, so `Success<undefined,
Invalid>` and `Success<undefined, Other>` are the same type, `undefined`;
the error arm of a `Result<undefined, E>` is still its `Failure<_, E>`,
which the phantom keeps distinct. Three consequences are observable; a fourth
item records a changed reason:

- `success(undefined)` and `success(null)` seed no `E = never` into a
  chain: `map(f, success(undefined))` is `Result<number, Error>`, so a
  `Result<number, Invalid>` annotation on that call does not compile.
  None of these narrow `E`: `success<undefined, Invalid>(undefined)` (the
  arm keeps no phantom), `andThen(validate, success(undefined))` (which
  gives `Invalid | Error`), a seed declared `Result<undefined, Invalid>`
  (its declared type narrows to `undefined` on assignment) and the curried
  `andThen`. What works is explicit type arguments on the combinator
  (`map<undefined, number, undefined, Invalid>(f, success(undefined))`),
  `result<undefined, Invalid>(undefined)` as the value, or a cast to
  `Result<undefined, Invalid>`; all three are pinned.
- A `Success` narrowed out of a `Result<number | undefined, E>` keeps its
  `undefined` through a generic. After `isSuccess(r) && r !== undefined`
  (or a `typeof r === 'number'` test, or `r!`), `r` is still a
  `SuccessArm<number | undefined, E>`, and a generic that infers `T` from
  `Result<T, E>` reads the alias's type argument, `number | undefined`.
  What regressed, because the `undefined` was lost from the Success arm
  before: `orElse(0, r)` and a user `unwrap<T, E>(x: Result<T, E>): T` no
  longer give a `number`, and `mapError(…, r)` and `Result.box(r).unbox()`
  widen back to `number | undefined`. On TypeScript 7.0 the narrowed-arm
  `unwrap`, `mapError` and `Result.box(r).unbox()` already failed on 0.4.0,
  so those are not regressions there. Ruling the `undefined` out of the
  whole `Result` first (`if (r === undefined) return`) does not help for
  `orElse` and `fallback` either: the `Failure` arm still names
  `number | undefined`, and both compiled before. Three cases already failed
  on 0.4.0 and before this amendment, so they are not regressions:
  `fallback(() => 0, r)` on the narrowed arm (its callback was typed
  `never`), `unwrap` after ruling the `undefined` out of the whole `Result`,
  and `unwrap` on a narrowed `string | null`. Workarounds, all pinned:
  explicit type arguments (`orElse<number, Invalid>(0, r)`), rebinding to a
  declared `Result<number, Invalid>`, or `map((n: number) => n, r)` first. Two
  structural alternatives were measured, on TypeScript 5.4, 5.9 and 7.0, and
  each costs more. Passing the alias the non-nullish part
  (`SuccessArm<Exclude<T, nullish>, E>`, and the `T & {}` and
  `NonNullable<T>` spellings) turns `plain(success(1))` into
  `[1 | undefined, never]`: `Failure` shares `[_phantom]` with the arm, and
  its optional `[_phantom]?: T` supplies the `undefined`. Renaming
  `Failure`'s marker removes that `undefined`. With or without the rename,
  `orElse(0, success(5))` breaks (`T` infers `0`, which
  `SuccessArm<5, never>` does not fit) and
  `if (isSuccess(r)) return map(f, r)` becomes a hard error for
  `r: Result<number | undefined, E>`. Distributing `Success` over `T`
  (`T extends nullish ? NoInfer<T> : SuccessArm<T, E>`) fixes seeding for a
  non-nullish `T` and most of the rest, but breaks `mapError`'s recovery
  inference, and makes the same `if (isSuccess(r)) return map(f, r)` a hard
  error. Under either alternative, a `success` of an optional value no
  longer flows into a generic at all: with `opt: number | undefined`,
  `map(f, success(opt))`, `plain(success(opt))` and
  `Result.box(success(opt))` are hard errors. Those flows compile today and
  are pinned so in `nullish-success.test-d.ts`.
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
  Handling it first helps `map` and `andThen` only, not `orElse`,
  `fallback` or a user `unwrap`; see the narrowed-arm cost above.
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

### 2026-11-15 — Typed fan-in over the unboxed Result: `collect` and `attempt`/`take` (#59)

The consumer feedback round (#56) found fan-in, not propagation, to be the
pain: 21 of slider's 22 `tryCatch` factories (at slider 55d9998) use
`tryCatch((dto) => { const x = assertSuccess(X.from(dto.x)); … })(dto)`
(`DialogueEntry.from`'s parts are throwing helpers), 180 `assertSuccess`
calls in slider's non-test src to 0 `andThen` callers, and that idiom
widens every factory's `E` to `Error` and turns a bug inside a part into a
Failure. Its two parsers differ: `parseBoard` is `tryCatch(() => …)()` with
`assertSuccess` calls, widened the same way; `parseOpenWhen` is `tryCatch(()
=> …, handler)()`, annotated `Result<OpenWhenExpr, OpenWhenSyntaxError>`,
with no `assertSuccess` and its `E` not widened. The "No
`all`/`sequence`" bullet's premise was that a fan-in needs a container; it
does not, because the parts are already unboxed.

A prototype (`prototypes/59/`, measured on TypeScript 5.9.3) rewrote three
slider factories (Position, Door and Slide: a precondition on the DTO, a
nested object of parts, an optional part, a list, and a step that depends on built
parts) with three candidates and scored them on error-union inference,
bugs staying separate from Failures, dependent steps, use inside callbacks,
readability and fit with the Result Box. The owner chose **A + B**:

- **`collect(parts)`**: an object of parts, a tuple or a list whose members are
  `Result`s (a plain member passes through). It returns the first
  `Failure` among the parts, or the parts themselves: on success no result
  object is built, and nothing is caught (**Update, 2026-11-16:** a part
  whose prototype chain cannot be read counts as not an `Error`, and what
  its trap threw is dropped; fan-in tests). Its value type is the parts with
  each member unboxed; its error type is the union of the members' error
  types, read through `ErrorOf`, inferred with no annotation: with
  `Position.from` annotated `Result<Position, InvalidCoordinate>`,
  `collect({ id: PieceId.from(dto.id), at: Position.from(dto.at) })` is
  `Result<{ id: PieceId; at: Position }, InvalidPieceId | InvalidCoordinate>`
  (the prototype's type; #115 keeps `readonly`, so there the value reads
  `{ readonly id: PieceId; readonly at: Position }`),
  and `collect(dto.path.map(Position.from))` is `Result<Position[],
InvalidCoordinate>` (**Update, 2026-11-16:** `Result<readonly Position[],
InvalidCoordinate>` as shipped). The parts are evaluated by the caller,
  eagerly, so a part cannot depend on another part (**Update,
  2026-11-16:** except through a getter or a Proxy's traps, which `collect`
  runs as it reads; #120 item 7): the construction step follows,
  through `map`, `andThen` or an early return. The `map`/`andThen` form
  carries a typed `E` across a factory boundary with nothing written by
  hand, but not the value: `/result`'s `map<A, U, T extends A, E>(fn:
(value: A) => U, value: Result<T, E>)` infers `A` from `fn` alone, never
  from `value`, and `andThen` and `pipe(value, map(…))` are the same, so
  over a `collect` the callback's parameter is `unknown` when plain and
  `any` when destructured: inside arm A, `new Door(at, id, …)` with the
  constructor's arguments swapped compiles. The construction step is
  typed only where its parameter is annotated by hand or in the
  early-return form, whose narrowed `parts` carry each member's type;
  B's `take` and C's `yield* take` type their values with nothing written.
  Arm A's factories and line counts are measured without those
  annotations; what to do about it (document the annotation, a
  `collect(parts, build)` form, or a change to `map` and `andThen`) is
  #115's. **Update, 2026-11-16:** the implementer of #115 chose the
  `collect(parts, build)` form under the ticket; see the amendment below
  (#115). The early-return form re-wraps the Failure (`if
(isFailure(parts)) return failure(parts)`), which leaks the nested
  `Failure` into an un-annotated return type; an un-annotated factory
  that mixes early returns with a combinator returns a union of Results
  that `isFailure` cannot take; and declaration emit fails where that
  leaked `Failure` is read through `ErrorOf`, in a `collect` or
  `collectAll` over it or an `andThen` whose callback returns it (a
  cannot-be-named error, TS4058 on a function, TS4023 on an exported
  const, TS4050 on a static method), while returning it unchanged,
  re-wrapping it in an early return, or passing it through `map` or
  `andThen` as the value emits; arm A's Door and Slide fail because they
  `collect` over `Position.from`. A return annotation resolves all three,
  and it must spell the union by hand: slider's factories are annotated
  `Result<X, Error>` (at slider 55d9998), and under that annotation the
  union widens to `Error`.
- **`attempt((take) => …)`**: the imperative form, slider's shape with
  `assertSuccess` renamed. `take(part)` unboxes the part or leaves the
  `attempt` with its Failure, by throwing a token private to that call,
  compared by identity (**Update, 2026-11-16:** one token per `take` given a
  Failure, recognised by a private field; see the amendment below (#115));
  `attempt` catches that token and nothing else, so
  a bug propagates (an `Error` or a bare string alike); a `take` from an
  enclosing `attempt` that is still running leaves that one
  (**Update, 2026-11-16:** `take`, like `collect`, takes a part whose
  prototype chain cannot be read as its value and drops what its trap threw,
  an enclosing `attempt`'s leave included; fan-in tests), and a `take`
  called after its own `attempt` has returned throws the token, a
  non-`Error`, to its caller (**Update, 2026-11-16:** given a Failure;
  given a Success it returns the value (#115)). `take` works inside `.map`
  and inside a Maybe `map` callback, and a step can depend on an earlier
  one. `E` has no inference site in the body: with no contextual type it
  falls to `Error` (not `never`, as the ticket's first probe had it); from
  the enclosing return annotation it is found, and `take` then rejects a
  part whose error is outside it (`take` is `<R extends Result<unknown,
E>>(part: R) => ValueOf<R>`; **Update, 2026-11-16:** the shipped
  constraint is wider, see the amendment below (#115); `take` also accepts,
  whatever its error, for example a Result whose value type is `any`, such
  as `tryCatch(() => JSON.parse(raw))()`, and a part typed `object`, `{}`,
  `void` or `Record<string, X>`, and, under `E = Plain`, where `class Plain
extends Error {}`, a Result of any error type is accepted, while under
  `E = NotFound`, where `class NotFound extends Error { override readonly
name = 'NotFound' }`, a Result whose error is `InvalidCount` is rejected
  (open, #120 item 5; fan-in type tests)). So a typed union at
  the boundary is the annotation's, written by hand; under slider's own
  `Result<X, Error>` annotation `E` is `Error`, no better than today. An explicit
  `attempt<T, E>` serves where there is no annotation. A factory's own
  failure is a `take(failure(…))` or an early return ahead of the
  `attempt`, never a throw. Its costs, measured: whatever in the body
  catches, or a `finally` that returns, sees the token, so a `try`/`catch`
  or a `return` inside `finally` swallows the leave, and a `tryCatch`
  inside the body sees it too: with the default handler the leave becomes
  a `ThrownError` Failure, a function handler that returns turns it into
  whatever it returns, its own Failure or even a Success, and one that
  rethrows it, as `catchOnly` or a class list does, lets it through; an
  `async` body compiles, as a Result of a Promise whose rejection is the
  token: an async function turns any throw into a rejection, a `take`
  before its first `await` included, and a `take` after it runs once the
  `attempt` has returned; and a plain `return failure(…)` in the
  body lands in `T`, with `E` still `Error`, where under an annotation it
  is a type error (**Update, 2026-11-16:** not under every annotation: with
  a value type that the returned Failure fits, such as `unknown`, it
  compiles; #120 item 2). The guards and docblocks for these are #115's.
  **Update, 2026-11-16:** shipped by #115; see the amendment below (#115)
  for the generator guard and the `attempt` docblock for the async guard
  (gaps: #120 items 3 and 6).

The third candidate, `gen`/`yield* take` (generator do-notation), infers
the exact union with no annotation and catches nothing, but a `yield*`
cannot sit inside a nested function, so lists and Maybe callbacks become
loops or go through `collect`, and it is `function*`/`yield*` noise on
every part. Not adopted; the prototype keeps it as the record.

Also decided:

- **Accumulation is recorded for #65, not shipped.** The prototype's
  `collectAll` keeps every failed part as one `Failures<E>`, an
  `AggregateError` subclass with `errors: E[]` in part order, which fits
  the encoding as any other Failure does; measured on Door, a nested
  object of parts nests its `Failures`, so flattening is a choice still open. As of
  2026-11-15 no consumer has asked for it. #65 (partially valid
  aggregates) decides. **Update, 2026-11-16:** deferred to a ticket of
  its own, after #115 and the best-effort prototype; see the amendment
  below (#65).
- **The names are `collect`, `attempt` and `take`**, and `collect` keeps
  all three input shapes (an object of parts, a tuple, a list) through one
  signature.
- **The Box statics are #89's.** `Result.collect({ … }).map(…)` and
  `Result.attempt((take) => …)` are candidate static entries on the Result
  Box; whether the Box carries them is decided with its other questions.

Implementation is #115: the two functions in `/result`, their docblocks,
CONTEXT.md entries, the README's module table, the `/result` surface test,
the CHANGELOG entry, and declaration-emit checks for a `collect`-built
factory with an annotated return type and for an un-annotated `collect`
plus `map` factory.

### 2026-11-16 — Partially valid aggregates: best effort is a module, accumulation waits, no absent state (#65)

The consumer feedback round (#56) found one consumer, slider, tolerating
partially valid input: its world-format parser keeps a three-state reader
result, and its editor a best-effort parse, beside the library's
`Result`. #65 asked whether that is fan-in with accumulation (which #59's
`collectAll` measured) or a different concept (a usable partial value
with diagnostics), and the grilling asked whether an "absent" state
belongs in the library. The owner decided, through the question tool;
the facts below, read from slider at 55d9998 and from `prototypes/59/`,
were refined in review after the decision and change no ruling.

**What slider does.** `ReaderResult<T>` (`src/world-format/readers.ts`,
used by the strict `parseWorld` that loads games as well as by the
editor) is `{ status: 'ok', value: T } | { status: 'absent' } | { status:
'error' }`, and its `'error'` case carries no payload: the diagnostic was
already pushed to a `ParseContext`'s `WorldFormatError[]` before the
reader returned. A `WorldFormatError` is a plain object with a message
and usually a position, not an `Error`; `WorldFormatErrors` wraps the
list in an `Error` so that a failed parse, strict or best-effort, fits
`Result`'s error channel. The editor-only `parseWorldBestEffort`
(`src/world-format/best-effort.ts`) returns `Result<BestEffortWorld,
WorldFormatErrors>`, where `BestEffortWorld` is the parsed world plus two
arrays: `diagnostics` holds every tagged `WorldFormatError` the parse
tolerated (wiring lints and entity-local problems, an excluded Piece
among them), and `dropped` holds a `BestEffortDrop` (kind, id, message,
an optional position and the raw DTO) for every Stage and Link its retry
loop dropped and for every Piece excluded after it parsed; a Piece whose
own entry fails its shape check is excluded with a diagnostic only, since
there is no DTO to keep, and a Piece excluded after it parsed appears in
both arrays, as one drop and one diagnostic. A partially valid world the
parse knows how to recover is a Success carrying both arrays; anything
outside that pinned policy (for example an untagged per-entry shape
error, a missing world id, a `World.from` rejection it cannot pin on one
entry, an exhausted drop budget) is the strict parse's Failure. A
dangling Link comes back a Success with the Link in `dropped` and
`diagnostics` empty, and slider's editor
(`src/editor-document/rebuild.ts`) treats a Stage or Link drop as a
blocking error and a diagnostic or a Piece drop as non-blocking. A known
gap in that consumer: the best-effort parse is blind to the `format:
world-v2` gate (its own test pins this), so a document that fails the
gate but is otherwise recoverable comes back a Success; the prototype
takes slider's behaviour as its measurement, not as the definition of
`toResult`. Slider's factories themselves fail fast (its ADR 0016 keeps
`tryCatch` over throwing code for multi-part constructors), and the
best-effort parse drops an invalid Piece and keeps the Board
(`validateBoardEntry` filters `pieces` before `Board.from`).

**Decided:**

- **No absent state.** An ok/absent/error outcome whose error carries a
  payload is `Result<Maybe<T>, E>`: Success of a Just, Success of a
  Nothing, Failure; the fan-in prototype reads an optional part that way
  (`prototypes/59/arm-a.ts`: a Maybe of a Result, which the unboxed
  encoding reads as a Result of a Maybe). Slider's three-state reader is
  a `Maybe<T>` plus a flag that a diagnostic was recorded elsewhere. The
  library adds no third case to `Result` or `Maybe`: a non-goal. Whether
  `BestEffort<Maybe<T>, D>` covers such a reader is the prototype's to
  measure.
- **Best effort is in scope, as its own module.** The concept is a value
  usable as it stands together with the diagnostics gathered while it was
  built: `BestEffort<T, D>`, at a new `/best-effort` subpath of its own.
  It is boxed, since a
  value plus a list has no unboxed encoding (nothing distinguishes a `T`
  from a `T` with diagnostics), as State is boxed. A diagnostic `D` is any
  value: slider's are plain objects, and an `Error` is admitted
  with everything else. The module carries the matching combinator
  surface (a constructor, `map`, an `andThen` that keeps the diagnostics
  in order) and a bridge each way with `Result`: `recover(result,
fallback)` turns a Failure into the fallback value with the error
  recorded as a diagnostic and a Success into itself with none;
  `toResult` fails when any diagnostic exists, through a consumer-supplied
  `(diagnostics) => Error`, because the library cannot choose how a list
  of diagnostics becomes one `Error` (slider wraps its own in
  `WorldFormatErrors`). `Result`'s unboxed encoding means an
  `Error`-typed value in `toResult`'s Success arm would read as a
  Failure; whether `toResult`, the constructor, `map` and `recover`'s
  fallback carry `success`'s `NotPossiblyAnError` guard (which rejects an
  all-optional, index-signature or unresolved `T`) or bypass it as
  `orElse` and `fromMaybe` do is the prototype's to measure. The shape is
  measured first: a prototype ticket builds the kit in `prototypes/`
  against slider's best-effort parse, measuring `D` against both of
  slider's arrays (a `toResult` that read only `diagnostics` would let a
  dropped Link through as a Success), and writes the module's own ADR and
  its CONTEXT.md entries from what it finds; this amendment records the
  rulings, not the shape. Whether the
  module gets a fifth Box is #89's question.
- **Accumulation waits for a ticket of its own**, after #115 has shipped
  `collect` and after the best-effort prototype has measured the kit, so
  that `collectAll`, the open question of whether nested `Failures`
  flatten, and a fan-in that keeps the parts that passed are designed
  against the shipped `collect` and the measured `BestEffort`. Whether a
  fan-in that keeps the parts that passed is a fan-in into a container,
  which the standing "No `all`/`sequence`" bullet bans, and if so whether
  it can ship, is that ticket's to decide. `Failures<E>` as measured in
  `prototypes/59/fan-in.ts` is the recorded shape until then.

### 2026-11-16 — `collect(parts, build)` and what #115 shipped (#115)

The #59 amendment left open what to do about the construction step after a
`collect`: `map` and `andThen` infer their callback's parameter from the
callback alone, so over a `collect` it is `unknown` when plain and `any`
when destructured, and swapped constructor arguments compile. The owner
did not rule on it: the implementer of #115 chose, under the ticket, the
second of its three remedies: **`collect(parts, build)`**, whose
`build` is typed from the parts. `build` returns a plain value or a Result,
and the result is `Result<ValueOf<R>, Failed<P> | ErrorOf<R>>`, so one form
serves where `map` and `andThen` would; the arity decides which form of
`collect` applies, as for the curryable combinators (ADR 0003). For example,
with `Id` and `Count` parts a swapped constructor argument inside `build`
does not compile.

- **Documenting a hand-written parameter type** was not chosen: it leaves
  the unsafe form the one that needs no annotation.
- **Changing `map` and `andThen` so `T` is inferred from `value`** was not
  chosen. A probe showed the applied form can infer its callback's
  parameter from the value (`(fn: (value: T) => U, value: Result<T, E>)`),
  but the curried `map(fn)` that `pipe` runs (ADR 0004) returns a function
  generic in `T` and `E`, so `pipe`'s context cannot type its callback. A
  probe with `E` as a type parameter of `map(fn)` itself types the callback
  inside `pipe` (a swapped argument fails), but a `map(fn)` made outside a
  `pipe` then fixes `E` at `Error`, and ADR 0003's generic unapplied form is
  lost. The change would also reach every applied `map` and `andThen`
  signature in `/result`, where `build` adds one overload to `collect`.
- The early-return and `map`/`andThen` forms stay as the #59 amendment
  describes them. `build` is the typed alternative to `map` and `andThen`;
  the early-return form already types each member.
- Shipped differently from the 2026-11-15 text:
  - The leave token is one per `take` given a Failure, recognised by a
    private field, where the 2026-11-15 text has one per `attempt`.
  - `Take`'s constraint is `Result<unknown, E> | null | undefined | void`,
    so a `Result<X | undefined, E>` is accepted.
  - An object of parts is read by its own string keys, enumerable or not
    (`Object.getOwnPropertyNames`), where the prototype read `Object.values`.
- Also shipped: `collect`'s value type is `readonly` one level deep. The
  guard on an `attempt` body compares the body's type with `Generator` and
  `AsyncGenerator` structurally: for example, `[1, 2].values()` is
  accepted, and with the ES2022 lib, for example, the type tests'
  `Countdown` (it declares `next`, `return` and `throw`, and its
  `[Symbol.iterator]()` returns itself) is refused, while the type tests'
  `NextOnly` (it declares only `next` and `[Symbol.iterator]()`) and
  `Listing` (its `[Symbol.iterator]()` is annotated
  `IterableIterator<number>`) are accepted (#120 item 3).

Open type questions are ticket 120.

### 2026-11-16 — The markers get exported names; an object spread stays open (#99)

#93 made `success(1)`, a ternary of `success` and `failure`, and a value
narrowed by `isSuccess` emit in a consumer's `.d.ts`, by reaching the arm
through the exported `SuccessArm`. Further consumer cases failed with TS4023
or TS4058 ("cannot be named" for `_phantom`, `_value` and `_error`) on main
(1bd9b19):

- An exported function returning a `Success` narrowed by `typeof`: for `u:
Result<number | string, Invalid>`, `if (isSuccess(u) && typeof u ===
'number') return u`.
- One narrowed by `in`: for `o: Result<{ id: string } | { name: string }, Invalid>`,
  `if (isSuccess(o) && 'id' in o) return o`.
- A `Failure` narrowed by `instanceof Invalid` or `'code' in`.
- An object spread of a `Success`: `export const s2 = { ...success({ id: 'x'
}) }`, and `return { ...r, extra: 1 }` after `isSuccess(r)`; and of a
  `Failure`: `{ ...failure(new Invalid()) }`.

`SuccessArm<T, E>` is `Exclude<T, …> & { markers }`, which distributes over a
union `T`, so `typeof` and `in` narrowing pick one constituent,
`number & { markers }`, that no longer carries the alias, and the marker
object is written out in the declaration, where its symbol keys cannot be
named.

**Decision: name the markers, with the marker shapes unchanged.**

```ts
export type SuccessMarkers<T, E extends Error> = {
  readonly [_phantom]?: E
  readonly [_value]?: T
  readonly [_error]?: never
}
export type FailureMarkers<T, E extends Error> = {
  readonly [_phantom]?: T
  readonly [_error]?: E
}

type SuccessArm<T, E extends Error = Error> = Exclude<T, …> & SuccessMarkers<T, E>
type Failure<T, E extends Error = Error> = E & FailureMarkers<T, E>
```

`SuccessMarkers` and `FailureMarkers` are type-only exports of `/result`.
The declaration of the `typeof` case writes
`number & import("…/result").SuccessMarkers<string | number, Invalid>`. The
`typeof`, `in` and `instanceof` cases above emit; pinned by
`test/declaration-emit/result.test.ts`, test "writes a narrowed Success as
SuccessMarkers, and a narrowed Failure as FailureMarkers". No type test in the
repository changed to make this pass, and `src/result/api-surface.test-d.ts`
gained the assertions for the two aliases, for the `_error` marker and for the
index signature.

**An object spread stays open.** The spread copies the marker properties into
a fresh object type, and that type is written out with its symbol keys. The
three spread cases above still fail with TS4023 or TS4058; they are pinned as
failing, with the explicit-type workaround pinned as emitting, in the tests of
`test/declaration-emit/result.test.ts` named "still fails with TS4023 or
TS4058" and "emits with an explicit type on the exported value", so that a
later fix flips the first. The README gives the workaround: an explicit type
on the exported value or function.

**Not chosen: markers as optional methods of a class.** A prototype made
`SuccessMarkers` and `FailureMarkers` classes whose markers are optional
methods (`[_phantom]?(): E | undefined`). An object spread does not copy a
method declared in a class, so the spread cases emitted. It was dropped
because a class instance type has no implicit index signature, so a `Success`
of an object type stopped fitting `Record<string, unknown>`: on that
prototype (commit 6441a31's tree, `tsc` from `typescript@5.9.3` on a
consumer file) `log(success({ id: 'x', name: 'n' }))` for `log(meta:
Record<string, unknown>)`, `if (isSuccess(r)) log(r)` for `r: Result<{ id:
string }, Error>`, `new URLSearchParams(success({ a: '1' }))` and
`success({ a: 1 }) satisfies Record<string, unknown>` fail with TS2345 or
TS1360, and compile on main. A breaking change for those calls was not worth
the spread. With this decision they compile, pinned by the test "a Success of
an object type fits an index signature; a Failure does not" in
`src/result/api-surface.test-d.ts`.

Also tried, on the same TypeScript: a named interface with the same optional
properties fixed the narrowing cases and not the spread, and exporting
`_phantom` from `/result` fixed neither spread case.

Checked with `tsc` from `typescript@5.4.5`, `typescript@5.9.3` and
`typescript@7.0.2` (each installed with `npm` in a scratch directory, run as
`node node_modules/typescript/lib/tsc.js -p .` on a consumer file per case):
the `typeof`, `in` and `instanceof` cases and the index-signature calls
compile and emit, and the three spread cases fail with TS4023 or TS4058. The
test file itself runs on the repository's TypeScript, 5.9.3.

Costs: two more type names on `/result`; the object spread of a `Success` or a
`Failure` still needs an explicit type in a consumer that emits declarations.
Not measured: a consumer with `exactOptionalPropertyTypes`.
