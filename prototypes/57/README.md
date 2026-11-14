# PROTOTYPE #57 — drop the type-argument cost on success/failure/result

Throwaway probe for
[#57](https://github.com/lhellemons/ground-types/issues/57). Nothing here
is part of the library: `src/` never imports it, and `run.sh` copies the
probes into `src/result/` only for the length of one measurement.

    prototypes/57/run.sh <main|a|b1|b> [typescript-version]

The script measures in a temporary `git worktree` of `HEAD`, so commit
what you want measured; the checkout you run it from is never touched.
`arm-a.patch`, `arm-b1.patch` and `arm-b.patch` are the diffs to
`src/result/index.ts` that each arm applies. `probe.test-d.ts` holds the
scenarios every arm must satisfy; `probe-b.test-d.ts` holds Arm B's extra
goal.

## Arm A — constructor signatures only

```ts
success<T, E extends Error = never>(value: T): Success<T, NoInfer<E>>
failure<E extends Error, T = never>(error: E): Failure<NoInfer<T>, E>
result<V>(value: V): Result<Exclude<V, Error>, unknown extends V ? Error : Extract<V, Error>>  // new first overload
result<T, E extends Error = Error>(value: T | E): Result<T, E>       // kept, for explicit calls
```

Why it works: a `Success` carries no error, so `E = never` is its honest
type, and `Success<T, never>` is assignable to any `Result<T, E>`. The
phantom stays, and it was never invariant: `readonly [_phantom]?: E` is
covariant, so `Success<number, Invalid>` widens to `Success<number,
Error>` and only the narrowing direction is rejected. The cost came from
the top-type defaults (`E = Error`, `T = unknown`) that the old
signatures forced onto every inferred call, meeting that covariant
phantom. The `unknown extends V` guard on `result` matters:
`Extract<unknown, Error>` is `never`, which would collapse
`result(caught)` to its Success arm and let a plain `Error` pass where
`Invalid` is required.

| Scenario (no type arguments)                                                                             | main                     | Arm A                            |
| -------------------------------------------------------------------------------------------------------- | ------------------------ | -------------------------------- |
| `(n): Result<number, Invalid> => success(n)`                                                             | error                    | ok                               |
| `(): Result<number, Invalid \| Other> => failure(new Invalid())`                                         | error                    | ok                               |
| `(x: number \| Invalid): Result<number, Invalid> => result(x)`                                           | error                    | ok (needs the `result` overload) |
| `if (isFailure(r)) return failure(r)` into a `Result<string, …>`                                         | error                    | ok                               |
| plain `Error` rejected where `Invalid` is expected (`failure`, `result` of a union, `Failure<_, Error>`) | rejected                 | rejected                         |
| `result(caught)` with `caught: unknown` keeps its `Error` arm                                            | `Result<unknown, Error>` | `Result<unknown, Error>`         |
| `Success<number, Invalid>` widens to `Success<number, Error>`; the reverse is rejected                   | yes                      | yes                              |
| `Result<Result<number>>` not assignable to `Result<number>`                                              | holds                    | holds                            |
| `if (isFailure(r)) return r` into a `Result<string, …>` (Arm B's goal)                                   | error                    | error                            |

Full suite under Arm A: 454 passed, 4 failed, identically on TypeScript
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
  `Result.from` the same overload restores parity but changes two more
  Box expectations (the "soft trap" at `box.test-d.ts:108` and the raw
  non-Result case at `:126`): `from` handed a whole `Result` then yields
  `Result<Success<…>, Failure<…>>`, still nested, so `box` keeps its job.
  It also breaks `box`'s promise that a raw value "degrades to exactly
  `from`'s behaviour": `Result.from(raw)` becomes `Result<T, never>` while
  `Result.box(raw)` stays `Result<T, Error>`. Which promise `box` keeps is
  for the implementation task and #66.
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
Arm A. The docblock's diagnosis (the invariant phantom) is wrong.

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
