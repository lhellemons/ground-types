# PROTOTYPE — value-only class binding

Throwaway. Answers [#38](https://github.com/lhellemons/ground-types/issues/38):
can a class be exported as a **value binding with no type binding**, while
keeping everything else the Box design needs?

Run it:

```
node prototypes/value-only-class-binding/run.mjs
```

The claim is entirely type-level, so the compiler is the harness. Claims that
must **hold** are `expectTypeOf`; claims that must **fail** are
`@ts-expect-error`, which is itself an error when the line below it compiles.
A clean pass 1 therefore proves both directions at once. Pass 2 carries the one
declaration-emit claim `@ts-expect-error` cannot express. Pass 3 re-runs the
claims against the emitted `.d.ts`, which is what a published consumer sees.

## Verdict: it works. All five properties hold.

The mechanism: declare the class privately, export a `const` bound to it.

```ts
class MaybeBox<T> {
  private constructor(private readonly value: T | undefined) {}
  static from<T>(value: T | undefined): MaybeBox<T> { ... }
  map<U>(f: (value: T) => U): MaybeBox<U> { ... }
  unwrap(): Maybe<T> { ... }
}

export const Maybe = MaybeBox
```

`const` binds only a value, so no type named `Maybe` escapes. `typeof MaybeBox`
carries the entire static side, generic factories included — nothing about the
static half is lost.

| #   | Property                           | Result                                                       |
| --- | ---------------------------------- | ------------------------------------------------------------ |
| 1   | `Maybe<T>` as an annotation errors | Holds — "refers to a value, but is being used as a type"     |
| 2   | `Maybe.from(v)` infers `T`         | Holds — inferred, explicit and nullary generic factories all |
| 3   | Constructor unreachable            | Holds — `new` and `extends` both rejected                    |
| 4   | Chains infer through several links | Holds — 4-link chain, callback params inferred at every link |
| 5   | Useful completion and hover        | Holds — full signature and docblock, through the `.d.ts` too |

Files: `maybe-box.ts` (value case), `fn-box.ts` (function case — the same
primitive works for `Fn`/`Call`), `root.ts` (root re-export), and the
`*.test-d.ts` files holding the claims.

## Findings the design should absorb

**The private constructor closes the `InstanceType` hatch.** `InstanceType<typeof Maybe>`
fails with "cannot assign a 'private' constructor type to a 'public' constructor
type". Unspellability rests on _two_ choices, not one — drop the private
constructor and the instance type becomes derivable again.

**`ReturnType<typeof Maybe.from<string>>` still recovers it.** A determined
consumer can name the instance type via a static factory's return type. This
is the remaining hatch, and it is not closable without giving up generic
static factories. It is narrow enough to leave open: a Box recovered this way
is still not assignable to `Maybe<T>`, so it cannot be smuggled into anything
the unboxed encoding guards.

**Declaration emit enforces transience at the consumer's edge.** A consumer
building with `declaration: true` cannot `export const x = Maybe.from(3)` —
`tsc` refuses with TS4094 (`Property 'value' of exported anonymous class type
may not be private or protected`) rather than inlining the unnameable class.
Free extra enforcement, but it is a compiler error a consumer will meet without
context, so it wants a line in the ADR. Note `@ts-expect-error` does **not**
suppress declaration-emit errors — hence the separate pass 2, and hence #46
cannot pin this one inline in a `.test-d.ts`.

**The private class name is user-visible.** Hovers and error messages both read
`MaybeBox<string>`. The type is unspellable, not invisible — so the private
class name is a naming decision, not an implementation detail.

**Name clash: `Maybe` the class and `Maybe` the type cannot share a file.**
Importing both bare is `Duplicate identifier 'Maybe'`. Aliasing one fixes it,
and via the root entry there is no clash at all (`maybe.Maybe<T>` is the type,
`Maybe` the class) — but a consumer importing from both `/maybe` and
`/maybe/box` in one file hits it. See `collision.test-d.ts` and
`collision-clash.test-d.ts`.

## Emitted declaration

Exactly what was wanted — the class present but unexported, the const exported:

```ts
declare class MaybeBox<T> {
  private readonly value
  private constructor()
  static from<T>(value: T | undefined): MaybeBox<T>
  map<U>(f: (value: T) => U): MaybeBox<U>
  unwrap(): MaybeValue<T>
}
export declare const Maybe: typeof MaybeBox
export {}
```
