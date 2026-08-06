# ADR-0005 — Box classes: a transient fluent layer over the unboxed encoding

Date: 2026-08-05. Status: accepted.

## Context

ADR-0001 commits this library to the unboxed encoding: a `Just<T>` _is_ the
`T`, a `Failure` _is_ the `Error`, no wrapper object is ever allocated, and
two guarantees fall out — a Maybe cannot nest, and a Success can never be an
Error. Everything stored, passed, or returned in a consumer's code is a
plain value.

The cost of that commitment is syntax. A chain of combinators reads
inside-out unless routed through `pipe` (ADR-0004), and `pipe`'s shape —
value first, steps trailing — is the functional idiom. Consumers who prefer
method chaining had no way to write `x.map(f).orElse(d)` without this
library allocating a wrapper, which is exactly what ADR-0001 forbids.

This ADR records the resolution of that tension: a **Box** — a class-based,
fluent layer over the existing combinators — and, more importantly, its
boundaries. A boxed chain class looks like a contradiction of ADR-0001. It
is admissible only because of how far it is _not_ allowed to travel, and
because the checker, not the documentation, is what stops it.

The layer was designed across eleven tickets of the
[chain-classes wayfinding map](https://github.com/lhellemons/ground-types/issues/36);
each decision's full reasoning lives in its ticket. This ADR is the record
of the outcome.

## Decision

### The Box is a transient chain builder

A **Box** is an object that holds one value (or one function) so that
chaining methods can be called on it. You enter through a static factory,
chain, and leave through a terminal. The boxed form exists _between_ a
factory call and a terminal call, and nowhere else:

- never stored in a field,
- never a parameter or return type of consumer code,
- never held across an `await`.

ADR-0001's encoding stays true of everything actually stored or passed — a
Box is fluent syntax over the unboxed value it holds, the OO cousin of
`pipe()`. The functional API is not deprecated, moved, or reshaped by this
layer; the two styles are alternatives, at full parity of capability
(every helper function is reachable in some form as a class member).

### The checker enforces the boundary

The transience rule above would be documentation if `Maybe<T>` could appear
in an annotation. It cannot: **each class is exported as a value binding
only**, with no accompanying class type binding — the class is declared
privately and exported as `export const Maybe = MaybeBox`. Writing
`Maybe<T>` in type position resolves to the _unboxed_ type (see below), so
annotating a field, parameter, or return type with it produces plain
`T | undefined` — the Box object itself has no spellable name to escape
through. The private constructor is load-bearing: it is what closes the
`InstanceType` route.

The one deliberate hatch is `ReturnType<typeof Maybe.from<T>>`, which does
spell the instance type. It is left open by design — it is loud, greppable,
and names its own workaround-ness — and declaration emit closes the silent
version of the leak: a consumer's own `.d.ts` that would need to name a Box
type fails with TS4094 rather than shipping one.

Each Box subpath exports **one name with both meanings**: the class in
value position, the module's unboxed type in type position —

```ts
class MaybeBox<R> {
  /* … */
}
export const Maybe = MaybeBox
export type Maybe<T> = import('./index.js').Maybe<T>
```

— so `const m = Maybe.from(x)` and `let y: Maybe<string>` both mean the
right thing, and the rule a consumer learns is one rule everywhere:
**lowercase is the functional namespace; capitalised is the Box class in
value position and the unboxed type in type position.** This mechanism is
narrow; see the failing-forms table under Consequences.

### Four classes, one shape

`Maybe`, `Result`, `Fn`, and `Call` — one class per module. `Fn` and `Call`
box a function rather than a value, but all four share the same primitive:
private constructor, static factories in, chaining methods, an explicit
terminal out. Each lives at a nested subpath following the `/promise/fake`
precedent — `/maybe/box`, `/result/box`, `/fn/box`, `/call/box` — and each
class is also re-exported from the root, so `import { Maybe, maybe }`
works.

A Box is parameterised by the unboxed type it holds: `MaybeBox<R>` holds an
`R` that is a `Maybe<T>`, `Just<T>`, or `Nothing<T>`; `ResultBox<R>` holds
a `Result`/`Success`/`Failure`; `FnBox<R>`/`CallBox<R>` hold the function
itself. Every chaining method's return type is its functional
counterpart's applied to that held type — which is what makes recovery
tracking free: `.orElse(d)` holds a `Success` and the terminal says so.

The **hard stop is at `Call`**. No boxed `Promise`, no `State` class, no
async variants of `map`/`andThen`. Invoking a `Call` hands you the existing
async API, which is already chainable because `AbortablePromise` is already
a class.

### Terminals

Leaving a Box is explicit. All four classes have `unbox()`, returning the
held value (or function); each also has a per-class getter naming what it
holds — `.value`, `.result`, `.fn`, `.call`. `Fn` additionally terminates
by application (`.apply(...args)`), `Call` by invocation
(`.invoke(input)`) — the verbs CONTEXT.md assigns to each.

`unbox` also takes an optional folding callback: `unbox(fn)` applies `fn`
to the held value and returns its result, readmitting on ADR-0004's
inside-out-reading grounds the folding terminal that was first declined —
at the cost that `unbox()` and the getter are no longer interchangeable.
Per ADR-0003, `unbox(undefined)` is an argument, not a zero-arg call, and
is a compile error.

There is no implicit exit. A Box that is built and never terminated — a
dangling Box — is accepted and, by the transience rule, confined to one
function body.

### Member placement: four ordered clauses

Where a helper lands on a class is decided by four clauses, in order:

1. **A way in is a static returning a Box.** `from` (the eponymous
   constructor's name on every class — `Maybe.maybe` would stutter),
   `Maybe.just`, `Maybe.nothing`, `Maybe.fromNullable`, `Result.success`,
   `Result.failure`, `Fn.identity`, `Fn.constant`, the two crossings
   (`Maybe.fromResult`, `Result.fromMaybe`), and `Result.box` — the way in
   for a `Result` already in hand, a factory's output above all. `box`
   exists on `Result` alone: only Result's encoding can lose an arm on the
   way in (`from`'s `T | E` inference), where `Maybe.from` already takes
   the Maybe exactly and `Fn.from`/`Call.from` take the thing itself — on
   those three, `box` would be a mere alias, against the no-aliases line.
   The domain building blocks gain no Box-returning variants: the gap
   their outputs exposed is the Box's own, and `Result.box` closes it
   where it lives.
2. **Anything transforming a subject in hand is an instance method.**
   `map`, `andThen`, `mapError`, `orElse`, `fallback`, the chaining
   asserts, the side-effect members, `Fn`'s `pipe`/`compose`/`tryCatch`,
   `Call`'s `abortable`/`resultify`.
3. **A guard or assert is _also_ a static taking an unboxed value** — the
   one clause where a static returns a non-Box. `Maybe.isJust(value)`
   narrows a raw `Maybe<T>` exactly as the free function does, because a
   type guard cannot be curried and so cannot fall to the rule below.
4. **Style plumbing gets no member.** `pipe` the free function, `compose`
   the free function, and `curry` have no static form — they _are_ the
   functional style. (`Fn` has instance `pipe`/`compose`, which are
   clause 2: same names, subject in hand.)

Statics reuse the functional name — capital vs lowercase already
distinguishes the namespaces (`Result.success` vs `result.success`).
Instance members **delegate** to the free functions rather than alias
them: each member's signature is restated against the held type, so the
`.test-d.ts` surface pins them against the module's or drift is invisible.

### Relationship to ADR-0003: statics never curry

ADR-0003 gives every config-taking combinator a dual calling shape. The
Box's statics deliberately do not inherit it — not by diverging, but by
**dissolving the question**: no static is the module's free function
re-attached. `Result.map` does not exist (reaching for it is a compile
error), so there is no class member whose currying behaviour could
silently differ from `result.map`'s. The statics that do exist — ways in
and guards — are exactly the members that cannot curry: a factory's
output is the Box, and a type guard's narrowing dies in a deferred form.
The crossings (`Result.fromMaybe`) exist only in applied form for the same
reason.

ADR-0003's arity rule still governs the one optional argument on the
surface: `unbox(undefined)` is an argument, and applies the fold.

The functional side of this effort (the `act`/`if*` helpers below) _is_
curryable per ADR-0003, with one note for the record: their unapplied
forms are deferred-generic on all five — the maybe module's first, on
typechecked evidence that config-bound `T` collapses `pipe` chains under
wide callbacks (`(v: unknown) => void`, i.e. every logger). `maybe/map`
and `maybe/andThen` keep their published config-bound pattern untouched.

### Parity, and where the Box is deliberately stronger

The parity rule started as "every member's return type is its functional
counterpart's" and was amended to **"its counterpart's return type, or a
narrowing of it"** when the Box turned out to be the stronger style in
three verified places:

- **`.map` tracks the Nothing arm.** `Box<Just<T>>.map(f)` is
  `Box<Just<U>>` where `pipe` over the same values gives `Maybe<U>` — the
  Box restates `map` against the held type, so an arm that provably is not
  there does not reappear. The Result side needs no helper for this:
  `Failure<U, never>` self-collapses, so a Success-only Box maps without
  readmitting arms.
- **A mid-chain recovery stays recovered.** After `.fallback(...)`, the
  Box holds a `Success` and the next link's error union starts empty. The
  functional style resurrects the dead arms from the Success phantom at
  the next `pipe` link — recorded here as a wart of the functional style,
  not of the Box.
- **`Result.success` seeds `E = never`** — the one deliberately divergent
  default (`result.success` defaults `E = Error`). A known-good seed
  carries no error arm, so a Box chain's union holds exactly what its
  links contribute. The functional seed's riding `Error` arm is the
  corresponding margin note below.

The error-type union itself survives arbitrarily long chains in both
styles — measured at 32 links against the real modules, every arm intact,
both styles identical at every checkpoint apart from the two Box
strengthenings above.

Where the Box is _weaker_, by design: **crossing modules costs a second
statement.** See the next section.

### No cross-Box members

`Maybe.fromResult` and `Result.fromMaybe` are statics with inlined
`instanceof Error` / `=== undefined` checks — the same convention
ADR-0001's bridges use — so the parity requirement never forces a runtime
import between the Box modules. The instance bridges (`.toResult()`,
`.toMaybe()`) that would have forced one are dropped. The naive cycle
actually runs clean under deferred use, but one eager static turns it into
a `ReferenceError` that fires or not depending on which subpath the
_consumer_ imports first — with nothing in CI to catch it. Convention over
gamble.

Crossing therefore costs a second statement — unbox, re-enter through the
other class's factory — and that is the one place the Box is not at parity
with `pipe()`, where the crossing is just the next step. (Returning
another module's Box from a helper would not compile anyway: the value
side works, but declaration emit hits TS4094. Taking one as a parameter is
free — and still forbidden by the transience rule.)

The no-runtime-cycle boundary remains **convention-only**, exactly as
ADR-0001 records for the bridges; the Box modules extend that convention,
and enforcing it with a build-time gate was explicitly ruled out of this
effort's scope (it was declined once already, PR #4).

### Guards, asserts, and narrowing on a Box

The transience rule invites a question the charting decisions did not
answer: how do you _branch_ on a Box without storing one? Answer: **query
and narrow it in place.** The four guards become instance predicates
typed as `this is Box<…>` — `box.isJust()` narrows the same generic class
to a narrower held type (`this is MaybeBox<Exclude<R, undefined>>`), no
subclass hierarchy, verified under `--strict`. Narrowing needs no type
binding, so the unspellable instance type survives untouched.

The guards _also_ stay as statics under the same name (clause 3). The
overlap creates one trap: `Result.isSuccess(box)` — the static handed a
Box instead of an unboxed value — typechecks and is always true, since a
Box is never an `instanceof Error`. It is closed **softly**: a poison
overload typed `(value: ResultBox<unknown>) => never`, marked
`@deprecated` so editors strike it through. It compiles (hard-erroring a
plain boolean position was judged worse than the strikethrough), but the
`never` kills any narrowing downstream.

`assertJust`/`assertSuccess` exist as chaining instance methods returning
a narrowed Box — they join `orElse` and `fallback` as members that
discharge an arm mid-chain, not terminals. On a Box whose held type
proves the assert must throw (`Failure`-only, `Nothing`-only), the result
collapses to `Box<never>` — the checker saying "this line never returns".

Two narrowing warts are recorded under Consequences: `else` does not
narrow, and narrowing is inert while the held type is an unresolved
generic.

### Side effects: `act` and the `if*` family, on both sides

Running a side effect mid-chain (log, emit a metric) previously required
abusing `map`. It arrives as **`act`** — run a callback over the passing
value, hand the value back unchanged — with conditional forms `ifSuccess`/
`ifFailure` on Result and `ifJust`/`ifNothing` on Maybe. `Fn` and `Call`
have none: their subject is a function, and a side effect over a function
is just composition.

Parity required these to exist as free functions too, so this effort
**adds to the functional API** — the only widening of the destination:
`result/act`, `result/ifSuccess`, `result/ifFailure`, `maybe/act`,
`maybe/ifJust`, `maybe/ifNothing`. Their callback contract, verified
rather than assumed: a `void`-typed callback parameter rejects nothing
under `--strict` (TypeScript's void-assignability special case admits
value-returning _and_ async callbacks silently), so the callbacks are
generic over `R extends NotAPromise<R>` — any synchronous return is
accepted and discarded, a thenable return is a worded compile error. An
unawaited `ifSuccess(async v => save(v))` cannot corrupt the chain's
value, but the reader thinks the chain waited and it didn't — the same
silent-trap species ADR-0003 exists to kill. Deliberate fire-and-forget
stays expressible: `ifSuccess(v => { void track(v) })`.

`act` receives the **whole** value (`Result<T, E>` / `Maybe<T>`);
`ifSuccess`/`ifJust` receive the case's value, `ifFailure` the error, and
`ifNothing` a zero-argument callback — a Nothing carries nothing to
inspect. The functional forms take and return the whole widened type; the
Box members return `this`, preserving narrowing, sanctioned by the
amended parity rule.

The name `act` was kept over the recommended `tap` even though _Action_
sits on the Call entry's `_Avoid_` list — an Act is something done _to_ a
value in passing, never the callable itself, and CONTEXT.md's Act entry
disambiguates the two the same way the Box entry disambiguates against
_boxed_.

### `Fn` and `Call`

An `Fn` Box holds **any arity**: `.pipe(f)` transforms `ReturnType<R>` and
leaves `Parameters<R>` alone, so an n-ary function chains without a
bridge. `.compose(g)` survives in its own right-to-left direction —
prepending a step replaces the whole parameter list, so it is gated to
unary subjects by the worded `UnaryInput<R>` — and a chain may mix
directions (`.compose(g).pipe(h)`), the accepted cost of keeping both
verbs. There is no `andThen` on `Fn`: nothing flattens. `Fn.identity<T>()`
is the one static whose arity diverges from its free function's (the free
`identity` takes the value; the static takes none and returns the Box of
the identity Mapper).

`tryCatch` is an **`Fn` instance method**, not a `Result` static: it fits
no Result clause — nothing goes in or comes out as a `Result` value — and
it is `.resultify`'s synchronous twin. It is gated by the worded
`NotAsync<R>`, applied as a worded `this` parameter — a defaulted type
parameter is never re-checked at a call site, so the constraint could not
carry the wording; the `this` parameter puts it in the TS2684 diagnostic
even for the zero-arg call.

On `Call`, `abortable` and `resultify` are instance methods — as statics
the class's only two operations would not chain — and the two orders are
**not equivalent**: `.abortable().resultify()` would silently discard the
abort handle (`resultify` builds its own plain promise). That order is
closed by the worded `NotAbortable<R>` — the first thing the Box layer
knows that the free functions structurally cannot, since the free
`resultify` accepts any Call and the discard happens invisibly.

The `Fn`/`Call` overlap is unclosable — every unary function is both — and
is repurposed as the **sanctioned crossing**: `Call` gets no composition
members and no bridge; to adapt a Call's input, leave through `.call`,
compose as an `Fn`, and re-enter `Call.from`.

### What the Box subpaths export

Each Box subpath exports the class's own name (both meanings) and nothing
else. Of the layer's own type helpers, only the **worded guards** are
public — `UnaryInput` and `NotAbortable` on their subpaths, `NotAsync` on
`/fn/box`, joining `NotAResult` and `NotAPromise`, each pinned by its
exact message string. Computed plumbing (`Present`, `Mapped`, `ValueOf`,
`ErrorOf`, the phantom handles) stays module-private — the line
`src/result/index.ts` already draws: a message a consumer will read is
public; machinery is not. The Result-side machinery the Box restates
member types with lives in `src/result/internal.ts`, a module deliberately
absent from the exports map.

## Consequences

- The library gains a second, optional style at near-full parity, and
  ADR-0001's guarantees still hold for everything stored or passed —
  enforced by the checker (no spellable instance type, TS4094 at
  declaration emit) rather than by documentation.
- The root export means `import { Maybe, maybe }` works, and capitalised
  names mean the Box class in value position and the unboxed type in type
  position, everywhere.
- **Bundle cost, measured:** a namespace-only consumer of the
  class-bearing root pays zero bytes. A class import costs what the class
  reaches, not what it counts: `Maybe`, `Result`, and `Fn` land at
  0.27–0.57 kB gzip; `Call` is ~1 kB because `Call.prototype.abortable`
  reaches `AbortablePromise`. Recorded, not acted on.
- **The surface ships with its implementation, as 0.4.0 — minor, and
  nothing publishes before that.** Until then the gap on main is guarded
  by unwiring, not convention: the signature files and their `.test-d.ts`
  pins are on main, but no `/box` subpath is declared in the exports map,
  the root re-exports nothing new, and the `act` family sits in its own
  modules (`src/maybe/act.ts`, `src/result/act.ts`) not re-exported from
  the module indexes — so a mid-gap release ships exactly today's
  package, and the built-but-undeclared state passes
  `assert-exports-resolve` and the api-surface pins as-is.
- The implementation effort inherits: the bodies; the wiring (the four
  `exports` entries, the root re-exports, re-exporting the `act` family
  from its module indexes, and the api-surface list updates that follow);
  runtime tests; README placement; the CHANGELOG entry; extending
  `scripts/assert-exports-resolve.mjs`'s reachability walk to nested
  non-index modules; and extending `test/api-surface/root.test.ts` past
  namespaces to the four class bindings.

### The name collision, and the forms that do not work

A file importing `Maybe` from both `/maybe` and `/maybe/box` is a
duplicate-identifier error, and `import type` does **not** sidestep it —
it relocates it: the type binding wins the name, so the follow-on
diagnostic is `TS2693: 'Maybe' only refers to a type…`, which points at
the wrong problem. The rule the docs must state: in a Box-using file, the
capitalised name comes from the Box subpath or from the root, never from
both it and the functional subpath.

The merged-name mechanism itself is narrow. Only `export const` plus a
locally declared alias works:

| Form                                                                                     | Result                                                                                                                         |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `export const Maybe = MaybeBox` + `export type Maybe<T> = import('./index.js').Maybe<T>` | **works**                                                                                                                      |
| `export const Maybe = MaybeBox` + `export type { Maybe } from './index.js'`              | `TS2323: Cannot redeclare exported variable`                                                                                   |
| `export { MaybeBox as Maybe }` + `export type { MaybeValue as Maybe }`                   | `TS2300` — **and the class wins the type meaning**, so `Maybe<string>` annotates the Box: a silent reversal of the enforcement |

The third row is the dangerous one: a well-meant refactor to matched
export clauses would quietly hand the type meaning to the class. The
source carries a comment saying so; this table is the record of why.

The type alias also restates its module's type-parameter list by hand —
arity, constraints, defaults — because the re-export form is unavailable.
That is the same silent-drift risk as the delegated instance members, and
it gets the same treatment: every alias and member is pinned in
`.test-d.ts` against its module counterpart, so drift fails a test instead
of shipping.

### Known warts, recorded here so the docblocks don't have to

1. **`else` does not narrow.** `this`-predicate narrowing applies in the
   guarded branch only; in the `else` branch use the paired guard.
2. **Narrowing is inert under an unresolved generic.** Inside
   `function f<T>(…)`, `box.isJust()` cannot reduce `Maybe<T>`'s
   conditional; the narrowed type only bites once `T` is concrete.
3. **`Result.isSuccess(box)` typechecks and is always true** — closed
   softly by the deprecated poison overload returning `never`, not
   hard-erroring.
4. **`.map` on a known-empty Box types its callback parameter `never`**
   (`Nothing`-only Maybe): correct — the callback provably never runs —
   but the diagnostic reads oddly at the call site.
5. **The functional style resurrects dead error arms** at the link after
   a mid-chain `fallback`, from the Success phantom; the Box does not.
   Two margin notes travel with this: an unannotated mid-chain `fallback`
   handler fails to compile in the functional style, and a plain
   `success(0)` seed rides an `Error` arm the whole functional chain —
   both absent at the Box boundary (`E = never` seed).
6. **Structurally identical error classes cannot be told apart** by
   `ifFailure` — lib.d.ts's `RangeError` vs `SyntaxError` — exactly as
   true of `mapError` today; structurally distinct classes reject
   correctly.
7. **`unbox()` and the getter are no longer interchangeable** since
   `unbox` gained the folding overload.
8. **A dangling Box is accepted.** Nothing forces a terminal; the
   transience rule confines the waste to one function body.
9. **`Result.from(resultInHand)` typechecks and silently degrades.**
   Handed a whole `Result` without explicit type arguments, `from` lands
   the union in the value arm and the error arm becomes a phantom
   `Error`. Structurally uncloseable — the phantom markers are optional,
   so no overload can tell a Result from a raw value — hence soft-marked:
   `from`'s docblock steers Results-in-hand at `Result.box`, whose
   parameter is the Result union itself and infers both arms exactly.
   (`box`'s own raw-value degradation to `from`'s behaviour is recorded
   in its docblock, harmless.)
