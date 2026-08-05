# What a class-bearing root entry costs a consumer's bundle

Prototype for [#47](https://github.com/lhellemons/ground-types/issues/47).
Throwaway — nothing here is meant to merge.

## What was built

This branch is a **fake implementation** of the Box layer, made only so a
bundler has real bytes to chew on:

- `src/{maybe,result,fn,call}/box.ts` — private class, private constructor,
  static factories, chaining methods, `unbox()` and a getter. The member
  **inventory** follows #43 and #45 (and `/result`'s exports, since #44 has
  not landed); the **types** are deliberately loose, because types are erased
  before a bundler sees the file and cannot affect a byte of output.
- `src/index.ts` — the four classes exported alongside the ten namespaces,
  i.e. charting decision 4 as written.
- `package.json` — the four `./…/box` subpaths added to `exports`.

`prototypes/root-export-bundle-cost/` is the harness: it links the package
(`link:../..`) and bundles 14 consumer entries against the real built `dist/`,
so it measures what an installed consumer would actually get.

## Running it

```sh
pnpm build                                       # from the repo root
node prototypes/root-export-bundle-cost/run.mjs
```

`roots/namespace-only.js` reproduces today's root — ten `export * as`, no
classes — against the same `dist`, so arm 1 and arm 2 differ by exactly the
four class bindings and nothing else.

## Results

Bytes are **minified / gzipped**, whole bundle, rollup 4.62 · esbuild 0.28 ·
webpack 5.109, all in production mode.

| # | consumer | rollup | esbuild | webpack |
|---|---|---|---|---|
| 1 | `{ maybe }` from the **namespace-only** root | 210 / 150 | 817 / 417 | 163 / 130 |
| 2 | `{ maybe }` from the **class-bearing** root | 210 / 150 | 817 / 416 | 163 / 130 |
| 3 | `{ map, maybe }` from `/maybe` | 210 / 150 | 171 / 140 | 163 / 130 |
| 4 | `{ Maybe }` from the root, `.from().map().unbox()` | 1321 / 475 | 1264 / 469 | 1241 / 453 |
| 5 | `{ Maybe }` from `/maybe/box`, same chain | 1321 / 475 | 1264 / 467 | 1241 / 453 |
| 6 | all four classes from the root | 6455 / 1880 | 6347 / 1847 | 6245 / 1772 |
| 7 | `{ maybe, Maybe }` from the root | 1313 / 470 | 1602 / 616 | 1233 / 448 |
| 8 | `{ Result }` from `/result/box`, one call | 1730 / 571 | 1673 / 574 | 1639 / 556 |
| 9 | `{ success }` from `/result` | 51 / 71 | 26 / 46 | 33 / 53 |
| 10 | `{ Call }` from `/call/box`, `.from().invoke()` | 3017 / 1075 | 3009 / 1084 | 2960 / 1048 |
| 11 | `{ Fn }` from `/fn/box`, `.from().apply()` | 574 / 271 | 577 / 276 | 560 / 256 |
| 12 | four **namespaces** from the root, same four ops | 2579 / 931 | 4789 / 1703 | 2448 / 888 |
| 13 | `{ abortable }` from `/call` | 2505 / 918 | 2490 / 926 | 2439 / 882 |
| 14 | nothing from the package at all | 36 / 56 | 34 / 54 | 402 / 251 |

Arm 14's webpack figure is that bundler's ESM-library boilerplate, not a cost
of this package; ignore it.

### 1. A consumer who never names a class ships none of them

Arm 1 and arm 2 are byte-identical in all three bundlers. Rollup's module
manifest agrees: in arm 2 the surviving modules are `dist/maybe/index.js`
and `dist/fn/index.js`, and all four `box.js` files are dropped.
`sideEffects: false` plus plain ESM static analysis is enough — `export
{ Maybe } from './maybe/box.js'` is a re-export with no side effect, and every
bundler tested drops it unread.

**Charting decision 4 costs a namespace-only consumer nothing.**

### 2. Root and subpath cost the same for the same class

Arms 4 and 5 are identical in rollup and webpack, and 2 gzipped bytes apart
in esbuild. Reaching a class through the root is not a penalty over reaching
it through its own subpath.

### 3. `export * as` does resist tree-shaking — in esbuild, and already

Going through the root costs esbuild **+646 B minified / +277 B gzipped**
(arm 1 vs arm 3), rollup and webpack nothing. That penalty is on today's
root, before any class exists, and adding classes does not move it (arm 2 is
arm 1 to the byte). The two are independent.

It compounds where a consumer mixes: four namespaces off the root cost
esbuild 4789/1703 against rollup's 2579/931 (arm 12), and `{ maybe, Maybe }`
costs 1602/616 against 1313/470 (arm 7). Worth knowing, but note where
esbuild actually bundles for production — Vite's production build is rollup,
so this mostly reaches consumers who run esbuild directly.

### 4. The prototype carries every method — and reach, not count, is the cost

A class is one object with every method on its prototype, so touching it
retains all of them, and everything they reach:

| Box | its own `box.js`, minified | whole arm |
|---|---|---|
| `Fn` (9 members) | 401 B | 574 / 271 |
| `Maybe` (20 members) | 885 B | 1321 / 475 |
| `Result` (21 members) | 986 B | 1730 / 571 |
| `Call` (7 members) | 286 B | **3017 / 1075** |

The smallest class is by far the most expensive one, and the ranking does not
follow the `box.js` column either — `Fn`'s own module is *larger* than
`Call`'s and its arm costs a fifth as much. `Call.prototype.abortable` reaches
`call/abortable` → `promise/index` → `AbortablePromise`, which is 2324 B
minified by itself, and drags `abort`, `promise/resultify` and
`call/resultify` in behind it.

So the lever is not how many members a Box has — cheap members like `act`,
`ifJust` and the guards are near-free — but whether any member reaches into a
*different, heavy* module. Exactly one does.

That cost is mostly `/call`'s, not the Box's: the functional `abortable`
already costs 2505/918 (arm 13), so the Box adds ~512 B / ~157 B on top of
it. What the Box removes is the **floor**. A functional consumer who never
wants abortability pays 36/56 (arm 14); a `Call` Box consumer pays 3017/1075
for `Call.from(f).invoke(x)`, because `.abortable` is on the prototype
whether it is called or not.

### 5. `scripts/assert-exports-resolve.mjs` has a blind spot, and it is not new

Deleting `./maybe/box` from the `exports` map while leaving
`dist/maybe/box.js` built, the script **exits 0** and prints "every built
module is exported". Its third direction only walks `dist/<dir>/index.js`, so
a nested non-index module is invisible to it — the same gap `/promise/fake`
already sits in, quadrupled by four Box subpaths.

The root re-export is covered for *resolution* only: the script imports
`dist/index.js`, which now transitively imports all four Box modules, so a
broken Box import would fail it. It says nothing about the root's *names* —
that is `test/api-surface/root.test.ts`, which asserts an exact key set and
describes itself as pinning "namespaces". Four class bindings need that list
extended and its wording revisited.

## Caveats

- The Box bodies are throwaway. Real bodies will differ, but only in the
  bytes of `box.js` itself, which the table breaks out separately — the
  reach-based findings (§4) and the tree-shaking findings (§1–3) do not
  depend on them.
- Per-module byte figures minify each module's rendered source on its own, so
  they miss cross-module renaming. They are an attribution, not a sum; the
  whole-bundle column is the number that ships.
- `/result`'s Box follows the module's exports, not #44, which is still open.
