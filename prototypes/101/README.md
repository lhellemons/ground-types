# PROTOTYPE #101 — a `stack?: never` marker on `SuccessArm`

Throwaway probe for
[#101](https://github.com/lhellemons/ground-types/issues/101). Nothing
here is part of the library: `src/` never imports it, and `run.sh` copies
the probe into `src/result/` only for the length of one measurement.

    prototypes/101/run.sh <main|a|b|b2> [path to a tsc binary] [--suite]

The script measures in a temporary `git worktree` of `HEAD`, so commit
what you want measured. It applies the arm's patch, typechecks with
declaration emit on, and prints, per tagged probe line, whether it raises
a diagnostic, then the diagnostics outside the probe. `--suite` also runs
vitest with the project's TypeScript: the type tests, the Box pins and the
consumer declaration-emit test.

| File           | What                                                                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `arm-a.patch`  | `readonly stack?: never` added to `SuccessMarkers`: every `SuccessArm` carries it                                                         |
| `arm-b.patch`  | the marker only on object members of `T` that still fit the marked type; a declared `stack` (public, private or protected) keeps its type |
| `arm-b2.patch` | arm B with the marker typed as a branded string (`string & { '#notAnErrorStack': true }`) in place of `never`                             |
| `probe.ts`     | the cases: raw `Error` returns the marker should close, and `stack`-carrying types it may break                                           |
| `example.ts`   | a standalone model of the four shapes side by side, for reading; it typechecks as written                                                 |

## Decision

The owner chose **arm B2** (2026-11-19); see ADR 0001's amendment of that
date. A follow-up ticket implements it.

## Measured

TypeScript 5.4.5, 5.9.3 (the project's) and 7.0.2 give identical results
for every arm.

**What it closes.** A raw `Error` returned without `failure()` into
`Result<T, Invalid>`, for every `T` ADR 0001 lists as the residual:
`object`, `{ name: string }`, `number | object`, `{ name?: string }`,
`Partial<{ name; port }>`, `{ message?; id? }`, `Object`,
`Record<string, any>`, `{ [k: string]: any }`,
`Readonly<Record<string, any>>`, `{ id?: string } & object`,
`{ cause?: unknown }`, a wrong `Error` subclass into `{ code: string }`,
and the unions `number | { name?: string }`, `number | Record<string, any>`.
Arm A closes all of them and `{ stack?: string }`; arms B and B2 close all
but `{ stack?: string }`, and any other `T` that declares `stack`
(`{ message?: string; stack?: string }`). B and B2 mark a member only when
it still fits the marked type, so a member that declares its own `stack`
keeps its type, whether that `stack` is public, private or protected
(`keyof` does not see a private or protected one). An index signature
alone does not count as declaring one, a template-literal one that
`'stack'` matches (``[k: `sta${string}`]``) included, so B and B2 still
close `Record<string, any>` and
``{ [k: string]: any; [k: `sta${string}`]: any }``. The fit test sits in
an alias of its own: nested in the object check, `U` reads as
`U & object`, which is `never` for a branded primitive such as
`Branded<string, 'Id'>`, and `collect`'s results collapse (36 more suite
diagnostics).

No arm closes `any`, `void`, an `Error` hidden in a value's static type
(`const v: { code: string } = new Other()`), or an `Error` subclass that
narrows its own `stack` to `undefined` (from the review of ticket 94).
Every marker is optional, so it accepts `undefined`:
`class Quiet extends Error { override stack = undefined }` returned into
`object`, `{ name?: string }` or `Record<string, any>` compiles on every
arm, and so does such a subclass with a `code` member into
`{ code: string }`. A plain `Error` cast to `Error & { code: string }` is
rejected by every arm.

**What arm A breaks.** A required `stack` member makes the whole arm
`never`: TypeScript reduces `{ id; stack: Frame[] } & { stack?: never }`
to `never`, so after `isSuccess` even `r.id` is TS2339, a raw `T` no longer
fits `Result<T>`, and `success(trace)` compiles silently to `never`. An
optional `stack?: string` keeps the object but its `stack` becomes
`undefined` only. Measured on a call stack (`Trace`), an undo stack (an
`Editor` class), a parser state holding a `Stack<string>`, and a log
record with `stack?: string`. A class named `Stack` is unaffected, and so is
generic code over `T extends { stack }` (the constraint stays deferred).
Arms B and B2 break none of these, nor an indexed type that declares
`stack` (`{ [key: string]: unknown; id: string; stack: number[] }`), nor a
class with a private or protected `stack`. Under A, a private `stack`
makes `success(instance)` silently `never` and a protected one breaks raw
returns. A JavaScript `#stack` is unaffected on every arm.

**What arms A and B break.** A `Success` of an object no longer fits a
string-valued index signature: `stack?: never` is an optional member whose
only value is `undefined`, so these are TS2345/TS2322:

    new URLSearchParams(success({ a: '1' }))
    const m: Record<string, string | number> = success({ a: '1' })

That reverses the pin ADR 0001's #99 amendment chose a design to keep. B2
keeps it: TypeScript drops the `undefined` of an optional member against
an index signature unless `undefined` is all it holds, and a branded string
fits a string-valued one.

**What every arm breaks.** A `Success` of an object into an index
signature whose value type does not accept the marker: number, boolean,
and string-literal unions. These are TS2322:

    const counts: Record<string, number> = success({ n: 1 })
    const m: Record<string, 'yes' | 'no'> = success({ answer: 'yes' as const })

`Record<string, unknown>` and `{ [k: string]: string | undefined }` still
fit. `'stack' in r` no longer narrows a `Result` of an object to its
`Failure` (`'stack' in r ? r.kind : …` is TS2339). Members that receive
the marker gain a readable `.stack` (TS2339 on `main`).

**What arms B and B2 break.** A `Success` whose value declares a `stack`
the marker does not fit no longer widens to a `Result` whose value type
omits `stack`. Through a variable, these are TS2322 (under A they compile,
but only because the `Success` is already `never`):

    const value = success({ id: 'x', stack: [1] })
    const widened: Result<{ id: string }, Invalid> = value
    const loose: Result<object, Invalid> = value

**What B2 breaks in the opposite direction.** A `Success` whose value omits
`stack` no longer fits a `Result` whose value declares an optional `stack`
that cannot hold the branded string, a readonly one included. Through a
variable, these are TS2322 under B2 only:

    const noStack = success({ id: 'x' })
    const t: Result<{ id: string; stack?: number[] }, Invalid> = noStack
    const u: Result<{ id: string; readonly stack?: number[] }, Invalid> = noStack

**An unsound read under B2.** The `.stack` it adds is typed as the brand or
`undefined`, but `success` adds no property and checks none, so a value
whose static type hides a real `stack` reads wrong. This compiles under B2
and throws at run time; on `main` and under A and B it is TS2339:

    const actual = { id: 'x', stack: 42 }
    const view: { id: string } = actual
    success(view).stack?.toUpperCase()

**The suite.** Arms A and B fail two type tests, 16 diagnostics: the
fifteen residual pins in `never-defaults.test-d.ts` ("a raw Error
returned without failure() still compiles into the residual types"), and
the `URLSearchParams` pin in `api-surface.test-d.ts` ("a Success of an
object literal type fits an index signature"). Arm B2 fails only the
first (1231 of 1232, on current `main`). Every other test
passes, the Box pins and the consumer declaration-emit test among them.
The probe's exported values emit declarations on every arm; the only
TS4023 is the spread of a `Success`, which fails on `main` too (the open
case the declaration-emit test pins).

**Unchanged by every arm.** Raw returns of a generic `T` and `success()`
of one fail on `main` already; `failure()` into any `Result` is untouched.

**Under `exactOptionalPropertyTypes`** (TypeScript 5.4.5, 5.9.3 and
7.0.2): the narrowed-`stack` subclass cannot be declared (TS2415), on
`main` and B2 alike, and a raw `Error` into `Result<object, Invalid>`
stays closed under B2 (TS2375).

**Not measured.** Compile time.
