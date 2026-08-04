# PROTOTYPE — Maybe/Result Box cycle

Throwaway. Answers [#40](https://github.com/lhellemons/ground-types/issues/40):
how do the `Maybe`↔`Result` Box bridges work without creating a runtime import
cycle?

Run it:

```
node prototypes/maybe-result-box-cycle/run.mjs
```

Five variants, each a pair of stand-in Box classes over the real `src/maybe`
and `src/result`. The harness compiles them, emits declarations, runs each
under Node's ESM loader, walks the emitted module graph, and bundles a
consumer with esbuild. Every claim below is measured, not argued.

| Variant                | What it does                                                                     |
| ---------------------- | -------------------------------------------------------------------------------- |
| **A** deferred cycle   | Both classes import each other; the sibling is touched only inside a method body |
| **A′** inferred return | Variant A with the cross-Box return type left to inference                       |
| **B** eager cycle      | Variant A plus one static field initialiser reading the sibling                  |
| **C** shared module    | Both classes in one private module; each subpath re-exports it                   |
| **D** one-sided        | `result/box` imports `maybe/box`; the edge runs one way                          |
| **E** statics only     | No cross-Box members at all; crossing means leaving the Box                      |

## Verdict: the cycle is real, and nothing the map requires needs it

The cycle is created by exactly two members — `Maybe.prototype.toResult` and
`Result.prototype.toMaybe` — and by nothing else. Both **bridge statics**
(`Maybe.fromResult`, `Result.fromMaybe`) are cycle-free: their argument is an
unboxed value, so the runtime check inlines exactly as `maybe/fromResult` and
`result/fromMaybe` already inline it. The map's "every helper reachable as a
class member" requirement is therefore satisfiable with **zero** cross-module
runtime imports. What is at stake is only whether you can cross **mid-chain**.

| Variant             | Cross mid-chain | Runtime cycle | TDZ risk               | A `/maybe/box` consumer that never crosses | Needs #38's hatch |
| ------------------- | --------------- | ------------- | ---------------------- | ------------------------------------------ | ----------------- |
| **A** cycle         | both directions | yes           | armed, order-dependent | 693 b — pulls in all of `result`           | yes               |
| **C** shared module | both directions | no            | none                   | 522 b — pulls in all of `result`           | no                |
| **D** one-sided     | one direction   | no            | none                   | 303 b (but `/result/box` pulls in `maybe`) | yes               |
| **E** statics only  | neither         | no            | none                   | 303 b                                      | only for params   |

(Bytes are esbuild, minified, tree-shaken, for a consumer that imports `Maybe`
and calls `.map()`. The absolute numbers are prototype-scale — these classes
have three members, not the real inventory. The **ratio** is the finding.)

## Findings

**Declaration emit binds harder than the runtime cycle does.** Any member
whose type is another module's Box fails declaration emit with **TS4094**
(`Property 'held' of exported anonymous class type may not be private or
protected`) — because decision 5 exports no type binding, so the emitter has
nothing to name and tries to inline the anonymous class instead. The fix is to
spell the type through the hatch [#38](https://github.com/lhellemons/ground-types/issues/38)
left open:

```ts
toResult<E extends Error>(error: E): ReturnType<typeof Result.from<T, E>>
```

So the "narrow enough to leave open" hatch is not merely tolerated — under
variants A and D the **library itself has to use it**, and the annotation is
load-bearing: delete it and the build fails with an error that names a
property, not a policy. Variant A′ is that failure, pinned.

**The deferred cycle does not break — and "lazy resolution" is already what it
is.** Variant A runs clean under Node ESM from both entry points, `instanceof`
intact across the boundary. A top-level import whose binding is read only
inside a method body **is** lazy resolution in ESM; there is no extra
indirection left to buy, and the ticket's "is lazy resolution acceptable?"
option collapses into variant A itself.

**It breaks on eager use, and only from one direction.** Variant B adds one
static field initialiser — the most ordinary reason a class would touch its
sibling while its own module evaluates:

```ts
static readonly EMPTY = Maybe.from<never>(undefined)
```

Entered from `result/box` it works. Entered from `maybe/box` it dies:

```
ReferenceError: Cannot access 'Maybe' before initialization
    at <static_initializer> (.../b-eager-cycle/result-box.js:18:26)
```

Same code, opposite outcome, decided by which subpath the **consumer** imports
first. That is the real answer to "does the cycle merely offend the rule?" —
it does not break today's members, it arms a trap that a future one-line
addition springs, in someone else's application, with a stack trace pointing
into this library. ADR 0001 already flags the maybe/result boundary as
convention-only, unenforced by `pnpm check` or CI; this makes the same
unenforced boundary load-bearing for runtime behaviour rather than just for
emitted-output tidiness.

**Tree-shaking cannot undo the coupling.** A bundler cannot prove `.toResult()`
is never called on a `Maybe` Box that is used, so the whole `Result` class and
`src/result` ride along: 693 bytes against 303 for a consumer that only ever
calls `.map()`. Under variant C it is 522 — better, because the shared module
skips one indirection, but still the whole of `result`.

**Taking the other Box as a _parameter_ is free; returning one is not.**
`Maybe` is a value binding, but `typeof Maybe.from` is a type query, so
`import type { Maybe }` erases completely under `verbatimModuleSyntax`. Variant
E's `Result.fromBox(error, box)` types its parameter as
`ReturnType<typeof Maybe.from<T>>` with **no** runtime import — measured: its
emitted module's closure contains no `maybe-box.js`. The line is precisely
_constructing_ the other Box, not _mentioning_ it. Useful to the member
inventories ([#43](https://github.com/lhellemons/ground-types/issues/43),
[#44](https://github.com/lhellemons/ground-types/issues/44)) — though
`fromBox` saves only the `.value` the caller would have spelled, so it buys an
ergonomic rounding error rather than a crossing.

**The shared module is the only variant where the sibling class is spellable
by name.** Two classes in one file are siblings in one `.d.ts`, so no hatch is
needed and the eager static that killed variant B is safe (order within one
file is deterministic):

```ts
declare class MaybeBox<T> {
  toResult<E extends Error>(error: E): ResultBox<T, E>
}
declare class ResultBox<T, E extends Error> {
  static readonly EMPTY: MaybeBox<never>
  toMaybe(): MaybeBox<T>
}
export declare const Maybe: typeof MaybeBox
export declare const Result: typeof ResultBox
```

Each subpath is then a one-line re-export (`export { Maybe } from './boxes.js'`),
which keeps decision 3's one-class-per-subpath at the export surface while the
two classes are one unit underneath.

**ADR 0001's invariant survives every variant, read literally.** The rule is
about `dist/maybe/index.js` and `dist/result/index.js`, and no variant touches
either — the Box modules are new files at new subpaths. What varies is whether
the library grows a _second_, coupled pair alongside the clean one.

## What is left for a human

Variant A is out on the TDZ evidence. That leaves a trade the measurements
cannot settle:

- **C** buys crossing in both directions and pays with the Box layer being one
  loading unit. Worth asking before choosing it: decision 2 puts `Fn` and
  `Call` on the same shape, and `Call` plausibly wants to reach `Result` too —
  does the shared module hold two classes, or eventually all four?
- **E** keeps every module independent and pays by being **strictly weaker
  than `pipe()`** at exactly one thing. Today `pipe(r, result.map(f),
maybe.fromResult, maybe.map(g))` crosses flat, mid-pipe; variant E's
  equivalent nests and reads inside-out. That is the same argument
  [#39](https://github.com/lhellemons/ground-types/issues/39) used to justify
  recovery tracking — and it cuts against E.
- **D** is the half-measure: one direction chains, the other exits, and one
  subpath still drags in the other module.
