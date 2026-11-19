# PROTOTYPE #101 — a `stack?: never` marker on `SuccessArm`

Throwaway probe for
[#101](https://github.com/lhellemons/ground-types/issues/101). Nothing
here is part of the library: `src/` never imports it, and `run.sh` copies
the probe into `src/result/` only for the length of one measurement.

    prototypes/101/run.sh <main|a|b> [path to a tsc binary] [--suite]

The script measures in a temporary `git worktree` of `HEAD`, so commit
what you want measured. It applies the arm's patch, typechecks with
declaration emit on, and prints, per tagged probe line, whether it raises
a diagnostic, then the diagnostics outside the probe. `--suite` also runs
vitest with the project's TypeScript: the type tests, the Box pins and the
consumer declaration-emit test.

| File           | What                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------- |
| `arm-a.patch`  | `readonly stack?: never` added to `SuccessMarkers`: every `SuccessArm` carries it                             |
| `arm-b.patch`  | the marker only on object members of `T` that declare no `stack` key (a conditional type)                     |
| `arm-b2.patch` | arm B with the marker typed as a branded string (`string & { '#notAnErrorStack': true }`) in place of `never` |
| `probe.ts`     | the cases: raw `Error` returns the marker should close, and `stack`-carrying types it may break               |
| `example.ts`   | a standalone model of the four shapes side by side, for reading; it typechecks as written                     |

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
but `{ stack?: string }`, and any other `T` that declares `stack`. No arm
closes `any`, `void`, an `Error` hidden in a value's static type
(`const v: { code: string } = new Other()`), or an `Error` subclass that
narrows its own `stack` to `undefined` (`override stack = undefined`, from
the review of ticket 94): every marker is optional, so it accepts
`undefined`. A plain `Error` cast to `Error & { code: string }` is
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
Arms B and B2 break none of these.

**What arms A and B break.** A `Success` of an object no longer fits a
string-valued index signature: `stack?: never` is an optional member whose
only value is `undefined`, so `new URLSearchParams(success({ a: '1' }))`
and `const m: Record<string, string | number> = success(…)` are
TS2345/TS2322. That reverses the pin ADR 0001's #99 amendment chose a
design to keep. B2 keeps it: TypeScript drops the `undefined` of an
optional member against an index signature unless `undefined` is all it
holds, and a branded string fits a string-valued one.

**What every arm breaks.** A `Success` of an object into a number- or
boolean-valued index signature: `const counts: Record<string, number> =
success({ n: 1 })` is TS2322. `Record<string, unknown>` and
`{ [k: string]: string | undefined }` still fit. Every arm also makes
`.stack` readable on every `Success` of an object (TS2339 on `main`).

**The suite.** Arms A and B fail two type tests, 16 diagnostics: the
fifteen residual pins in `never-defaults.test-d.ts` ("a raw Error returned
without failure() still compiles into the residual types"), and the
`URLSearchParams` pin in `api-surface.test-d.ts` ("a Success of an object
literal type fits an index signature"). Arm B2 fails only the first (1161
of 1162). Every other test passes, the Box pins and the consumer
declaration-emit test among them. The probe's exported values emit
declarations on every arm; the only TS4023 is the spread of a `Success`,
which fails on `main` too (the open case the declaration-emit test pins).

**Unchanged by every arm.** Raw returns of a generic `T` and `success()`
of one fail on `main` already; `failure()` into any `Result` is untouched.

**Not measured.** A consumer with `exactOptionalPropertyTypes`, and
compile time.
