# PROTOTYPE #57 — drop the type-argument cost on success/failure/result

Throwaway probe for
[#57](https://github.com/lhellemons/ground-types/issues/57). Nothing here
is part of the library: `src/` never imports it, and `run.sh` copies the
probes into `src/result/` only for the length of one measurement.

    prototypes/57/run.sh <main|a|b1|b> [typescript-version]

The script measures in a temporary `git worktree` of `HEAD`, so commit
what you want measured. The checkout you run it from keeps its tracked
files; the script runs the worktree's own `vitest` binary, so pnpm never
re-installs through the shared `node_modules`.
`arm-a.patch`, `arm-b1.patch` and `arm-b.patch` are the diffs to
`src/result/index.ts` that each arm applies. `probe.test-d.ts` holds the
scenarios every arm must satisfy; `probe-b.test-d.ts` holds Arm B's extra
goal.

## Arm A — constructor signatures only

```ts
success<T extends NotPossiblyAnError<T>, E extends Error = never>(value: T): Success<T, NoInfer<E>>
failure<E extends Error, T = never>(error: E): Failure<NoInfer<T>, E>
type Success<T, E> = … & { [_phantom]?: E; [_value]?: T; [_error]?: never }  // new third marker
type ErrorArmOf<V> = unknown extends V ? Error : V extends Error ? V : V extends Primitive | null | undefined ? never : Error
result<V>(value: V): Result<Exclude<V, Error>, ErrorArmOf<V>>          // new first overload
result<T, E extends Error = Error>(value: T | E): Result<T, E>       // kept, for explicit calls
```

Why it works: a `Success` carries no error, so `E = never` is its honest
type, and `Success<T, never>` is assignable to any `Result<T, E>`. The
phantom stays, and it was never invariant: `readonly [_phantom]?: E` is
covariant, so `Success<number, Invalid>` widens to `Success<number,
Error>` and only the narrowing direction is rejected. The cost came from
the top-type defaults (`E = Error`, `T = unknown`) that the old
signatures forced onto every inferred call, meeting that covariant
phantom. `ErrorArmOf` on `result` matters: `Extract<V, Error>` is `never`
for every `V` an Error is assignable to without being one (`unknown`,
`object`, `{}`, a narrowed `catch` binding), and any object type some
Error subclass fits (`{ code: string }`) can hide one, which would
collapse `result(e)` to its Success arm and let an `Error` pass where
`Invalid` is required. `ErrorArmOf` keeps `Error` in the arm for every
non-primitive member and drops it only for primitives (branded too),
`null` and `undefined`, the one sound rule from the input type alone
(review round 4).

`NotPossiblyAnError<T>` (review rounds 4 and 6) rejects a `success` of a
value whose type the type system can see may hold an Error: a union with
an Error member, a `Result` or `Failure`; a type the empty object fits
(`unknown`, `object`, `{}`, an all-optional object, and any union of one
with a primitive, `null` or `undefined`); a type a plain Error fits (`{
message: string }`). It names `result()` as the fix. Class instances,
arrays, DTOs with a required member, primitives, `undefined` and `void`
pass with no type arguments. The residual, on record: an object type
that only an Error _subclass_ fits structurally passes, a plain interface
(`{ code: string }` holding an `Other`), a DTO, a class instance without
private members (`Game` holding a `Sneaky extends Error` with the same
members); `any` passes too. Breaking: `success` of any such value at any
site (`(p: Partial<Config>): Result<Partial<Config>> => success(p)`),
`success` of an unresolved `T`, `failure<E>(e)`'s phantom (`never`, was
`unknown`) and the one-type-argument `result<X>(v)` (`result<number>(5)`
is now `Result<number, never>`); generic code casts instead (three
library-internal sites in the patch). The
`[_error]?: never` marker on `Success` closes the hole review round 3
found: with `failure`'s `T` defaulting to `never`, `Failure<never, Error>`
fitted `Success<unknown, Invalid>` structurally (phantom `never` passes,
an Error object satisfies `unknown`), so `(): Result<unknown, Invalid> =>
failure(new Error())` compiled. No Failure can satisfy `[_error]?: never`.

| Scenario (no type arguments)                                                                                                                                                                                | main                                        | Arm A                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------- |
| `(n): Result<number, Invalid> => success(n)`                                                                                                                                                                | error                                       | ok                                                            |
| `(): Result<number, Invalid \| Other> => failure(new Invalid())`                                                                                                                                            | error                                       | ok                                                            |
| `(x: number \| Invalid): Result<number, Invalid> => result(x)`                                                                                                                                              | error                                       | ok (needs the `result` overload)                              |
| `if (isFailure(r)) return failure(r)` into a `Result<string, …>`                                                                                                                                            | error                                       | ok                                                            |
| plain `Error` rejected where `Invalid` is expected (`failure`, `result` of a union, `Failure<_, Error>`)                                                                                                    | rejected                                    | rejected                                                      |
| `result(caught)` with `caught: unknown` keeps its `Error` arm                                                                                                                                               | `Result<unknown, Error>`                    | `Result<unknown, Error>`                                      |
| `result(o)` with `o: object`, `{}`, `{ message: string }`, or a narrowed `catch` binding                                                                                                                    | `Result<object, Error>`                     | `Result<object, Error>`                                       |
| `result(new Error())`                                                                                                                                                                                       | `Result<Error, Error>`                      | `Failure<never, Error>`                                       |
| `result(hidden)` with `hidden: { code: string }` holding an `Other` error, into `Result<{ code: string }, Invalid>`                                                                                         | rejected                                    | rejected (arm stays `Error`)                                  |
| `result(email)` with a branded string, `result(n: number)`, `result(null)`                                                                                                                                  | `E = Error`                                 | `E = never`                                                   |
| `success(caught: unknown)`, `success(o: object)`, `success(x: number \| Error)`, `success(ro: Result<number, Other>)`, `success(result(x))`, `success(opt: { id?: string })` into `Result<…, Invalid>`      | rejected (via `E = Error`)                  | rejected (via the `T` guard)                                  |
| `success(game: Game)`, `success(xs: readonly Game[])`, `success(dto: { id: string })` into `Result<…, Invalid>`                                                                                             | error                                       | ok                                                            |
| `success(hidden: { code: string })` holding an `Other`, and `success(g: Game)` holding a `Sneaky extends Error` with Game's members, into `Result<…, Invalid>`                                              | error                                       | compiles (known sharp edge)                                   |
| `function w<T>(x: T): Result<T> { return success(x) }`, `success<T, Invalid>(x)` with `T extends { id: string }`, `success<unknown>(caught)`                                                                | ok                                          | rejected (Breaking; cast or `result()`)                       |
| `success(loose: any)`                                                                                                                                                                                       | ok                                          | ok (`any` passes every constraint)                            |
| `success(x)` with `x: object \| undefined`, `{ id?: string } \| undefined`, `string \| object`, `{} \| null`, `Record<string, unknown> \| undefined`, `{ stack?: string } \| number`, `{ message: string }` | error                                       | rejected (round 6 guard)                                      |
| `success(x)` with `x: { id: string } \| undefined`, `undefined`, `void`, `Game[]`                                                                                                                           | error / ok                                  | ok                                                            |
| `(p: Partial<Config>): Result<Partial<Config>> => success(p)`, `success(p)` with no target, `success<Partial<Config>, Error>(p)`                                                                            | ok                                          | rejected (Breaking)                                           |
| `result(nested)` with `nested: Result<Result<number, Invalid>, Invalid>` into `Result<number, Invalid>`                                                                                                     | error                                       | compiles (primitive value; an object value is still rejected) |
| `result(u)` with `u: number \| Invalid \| Other`                                                                                                                                                            | `Result<number \| Invalid \| Other, Error>` | `Result<number, Invalid \| Other>`                            |
| `failure(new Error())` or `result(err)` into `Result<unknown \| object \| {} \| { id?: string }, Invalid>`                                                                                                  | rejected                                    | rejected (via `Success`'s `[_error]?: never`)                 |
| `Success<number, Invalid>` widens to `Success<number, Error>`; the reverse is rejected                                                                                                                      | yes                                         | yes                                                           |
| `Result<Result<number>>` not assignable to `Result<number>`                                                                                                                                                 | holds                                       | holds                                                         |
| `if (isFailure(r)) return r` into a `Result<string, …>` (Arm B's goal)                                                                                                                                      | error                                       | error                                                         |

Full suite under Arm A: 478 passed, 4 failed, identically on TypeScript
5.9.3, 6.0.3 and 7.0.2. The four:

- `index.test-d.ts` "binds failure's single explicit type argument": now
  `Failure<never, Invalid>`, was `Failure<unknown, Invalid>`. Expectation
  changes.
- `index.test-d.ts` "keeps success value-first": `success<number>(5)` is
  now `Success<number, never>`, was `Success<number, Error>`. Expectation
  changes.
- `box.test-d.ts` "from is the boundary lift, and its inference is its
  counterpart's exactly": `Result.from(numberOrError)` no longer matches
  `result(numberOrError)`. Only the `result` overload causes this. Giving
  `Result.from` the same overload (with `ErrorArmOf` moved to
  `./internal.ts`) restores parity and moves two Box expectations
  instead: `Result.from(0)` at `box.test-d.ts:62` (now `E = never`) and
  the "soft trap" at `:108`, where `from` handed a whole `Result<BoxUser,
InvalidUser>` yields `Result<Success<BoxUser, InvalidUser>, Error |
Failure<BoxUser, InvalidUser>>`, not assignable to the flat type, so
  `box` keeps its job for object values. For a primitive-valued Result the
  overload's output flattens: `result(nested)` with `nested:
Result<Result<number, Invalid>, Invalid>` is `Result<number, Invalid>`,
  where main rejects it (the nesting invariant on the types is untouched).
  `Result.success` has no guard; handed to the implementation task and #66.
  The raw object case at `:126` does not move (an object keeps `Error`
  under the conservative arm). Four expectations move in all. The
  overload breaks `box`'s promise that a raw value "degrades to exactly
  `from`'s behaviour" for primitive, `null` and `undefined` raw values
  only: `Result.from(5)` is `Result<number, never>` while `Result.box(5)`
  is `Result<number, Error>`. Which promise `box` keeps is for the
  implementation task and #66.
- Note for the implementation task's tests: `failure(narrowed)` with
  `narrowed: Failure<number, Invalid>` is `Failure<never, Failure<number,
Invalid>>`, which flows into a different `Result<X, Invalid | …>` only
  because the two phantoms intersect to `undefined`. Pin that.
- `probe-b.test-d.ts`: Arm B's goal, expected to fail under Arm A.

`definePrimitiveValueObject`: `E` is not inferred from `errorHandler`
because `definePrimitiveValueObject<Email>(…)` names `T` explicitly, and
TypeScript never infers the type parameters left out of a partial list;
they take their defaults. With no type arguments at all
(`definePrimitiveValueObject((value: string) => value as Email, () => new
InvalidEmail())`) `T`, `P` and `E` all infer, on main as well as under
Arm A, for a handler returning a bare Error. A handler written with
`failure()` or `result()` infers wrong or fails on main and infers under
Arm A (probed). The docblock's diagnosis (the invariant phantom) is
wrong, and 0.4.0's instruction to name `T, P, E` for handwritten
handlers goes with the implementation.

## Arm B — return a narrowed failure as-is

B1 (`arm-b1.patch`, Arm A plus the narrowing): `isFailure` narrows to
`Failure<never, E>`. `return r` compiles, but
the false branch of `isFailure` no longer narrows: TypeScript removes
only the constituents that are subtypes of the narrowed type, and
`Failure<T, E>` is not a subtype of `Failure<never, E>`. Every
`if (isFailure(r)) return r; use(r)` then sees `r` as the whole `Result`.

B2 (`arm-b.patch`, Arm A plus the drop): drop `Failure`'s `[_phantom]?:
T`. `return r` compiles and the false
branch narrows, but `Result<Result<number>>` becomes assignable to
`Result<number>`: `Success`'s `[_value]?: T` handle cannot guard it,
because `Success<Result<T>>` intersects the inner `Success<T>`'s own
handle, and an intersection is assignable to either side. The runtime
suite's type assertion at `index.test.ts:358` fails, `promise/resultify`'s
inference degrades, and `T` becomes an unused type parameter.

No variant satisfies both the false-branch narrowing and the no-nesting
invariant: the invariant is held by `Failure`'s phantom `T` alone, and
`return r` across a different `T` needs that phantom not to discriminate.
Arm B is ruled out. Under Arm A the same site is `return failure(r)`.

## Consumer sample (2026-11-14)

|                                            | zinbow (TS ~6.0.3) | over-and-out (TS 7.0.2) |
| ------------------------------------------ | ------------------ | ----------------------- |
| `failure<E, T>(…)`                         | 261                | 10                      |
| `success<T, E>(…)`                         | 127                | 6                       |
| `result<T, E>(…)`                          | 0                  | 0                       |
| of which `failure<…>(identifier)` re-wraps | 92                 | 1                       |

Every one of these sites is removable under Arm A (the re-wraps become
`failure(x)`), as far as the sample shows; sites that name `T` for a
reason other than the phantom would keep it. `result` has no measured
consumer cost.
