# PROTOTYPE #101 — a `stack` marker on `SuccessArm`, measured and declined

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

The arm patches apply to `src/result/index.ts` as of `main` at ebe4841 and
stop applying once that file moves. `--suite` runs vitest with `--no-cache`,
so it leaves no results cache, but vitest still writes temporary files into
the invoking checkout's `node_modules` through the symlink (the config
loader's `.vite-temp`, and a `tsconfig.tmp.tsbuildinfo` from the type check).

| File           | What                                                                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `arm-a.patch`  | `readonly stack?: never` added to `SuccessMarkers`: every `SuccessArm` carries it                                                         |
| `arm-b.patch`  | the marker only on object members of `T` that still fit the marked type; a declared `stack` (public, private or protected) keeps its type |
| `arm-b2.patch` | arm B with the marker typed as a branded string (`string & { readonly '#notAnErrorStack': true }`) in place of `never`                    |
| `probe.ts`     | the cases: raw `Error` returns the marker should close, and `stack`-carrying types it may break                                           |
| `example.ts`   | a standalone model of the four shapes side by side, for reading; it typechecks as written                                                 |

## Decision

**No marker; the residual stays** (2026-11-22); see ADR 0001's amendment
of that date. The owner chose arm B2 on 2026-11-19 and reopened the choice
after five review rounds each found new costs. The measurements below are
the record of why, and the list of costs is known to be incomplete. No type
changes.

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
narrows its own `stack` to `undefined` (from the review of ticket 94). Every
marker is optional, so it accepts `undefined`:
`class Quiet extends Error { override stack = undefined }` is admitted
wherever its other members fit the target. It compiles into `object`,
`{ name?: string }` or `Record<string, any>` on every arm, and so does such
a subclass with a `code` member into `{ code: string }`. The marker also
opens to it targets that weak-type detection rejected before: `Quiet` into
`Result<{ id?: string }, Invalid>` or `Result<{}, Invalid>` is TS2322 on
`main` and compiles on every arm, since the marker gives the target a member
`Quiet` shares. A plain `Error` cast to `Error & { code: string }` is
rejected by every arm. A declared `stack?: any` fits the marker, so B and B2
mark it (it keeps `any`) and a raw `Error` into
`Result<{ stack?: any }, Invalid>`, open on `main`, is closed.

**What arm A breaks.** An object constituent of `T` with a required
`stack` that cannot hold `undefined` reduces to `never`; other union
constituents survive. A required `stack: string | undefined` does not
collapse the object. TypeScript reduces `{ id; stack: Frame[] } & { stack?: never }`
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
fit under every arm; `Record<string, string>` under B2 only (above).
`'stack' in r` no longer narrows a `Result` of an object to its `Failure`
(`'stack' in r ? r.kind : …` is TS2339). Members that receive the marker
gain a readable `.stack` (TS2339 on `main`).

**What every arm breaks, on index-signature members.** They already read
`.stack` through the index, and the marker replaces that type rather than
adding to it: on `Success<Record<string, number>>` it is
`NotAnErrorStack | undefined` under B2 (`undefined` under A and B). These
are TS18048, and the `typeof` check narrows to `never`:

    declare const sAny: Success<Record<string, any>, Invalid>
    sAny.stack.length // any on main
    declare const sStr: Success<Record<string, string>, Invalid>
    sStr.stack.length // string on main
    declare const sNum: Success<Record<string, number>, Invalid>
    sNum.stack + 1 // number on main
    typeof sNum.stack === 'number' // narrows to never

**What every arm breaks: error-like parameters and `keyof`.** A `Success`
passes where an error-like weak type is expected, so an un-narrowed
`Result` handed to an error handler by mistake is no longer caught, and
`.stack` on an un-narrowed `Result` becomes readable. `keyof` of a
`Success` gains `'stack'`, so string-key projections and mapped types over
it change:

    declare function logE(e: { stack?: string }): void
    logE(success({ a: 1 })) // TS2559 on main; compiles on every arm
    const user = success({ id: 'x' })
    type Columns = Record<Extract<keyof typeof user, string>, string>
    const columns: Columns = { id: 'text' } // TS2741 on every arm

**What every arm changes: `Object.values` and `Object.entries`.** The values
of a `Success` of a plain object include the brand under B2
(`number | NotAnErrorStack`): these are TS2365, TS2345 and TS2339 there, and
compile on `main`. Under A and B they compile, but the values are `any`
(`Object.values(sc)` is `any[]`), so a wrong method on them compiles too
(`Object.values(sc).map((v) => v.toUpperCase())` is TS2339 on `main` and B2):

    declare const sc: Success<{ a: number; b: number }, Invalid>
    Object.values(sc).reduce((x, y) => x + y, 0)
    Math.max(...Object.values(sc))
    Object.entries(sc).map(([, n]) => n.toFixed())

**What B and B2 break in generic code.** `Success<Exclude<T, Error>>` no
longer widens to `Success<T>`, so a wrapper that returns `result(value)`
with inferred type arguments is TS2322; explicit
`result<T, Error>(value)` still compiles. Widening without any constructor
call fails too, where explicit type arguments cannot help; it compiles on
`main` and A:

    function lift<T>(value: T): Result<T, Error> {
      return result(value)
    }
    function partial<T>(r: Result<T>): Result<Partial<T>> {
      return r
    }

**What arms B and B2 break: lost widening.** Any value whose type declares a
`stack` the marker does not fit, a plain `stack: string` or `stack?: string`
included (log records, serialised errors), no longer fits a `Result` whose
value type omits `stack`. These are TS2322 (TS2345 as an argument; the
literal is TS2353 under A and B, an excess property). A compiles most of
them only because its `Success` of such a value is already `never`:

    declare const rec: { level: string; stack: string }
    const raw = (): Result<{ level: string }, Invalid> => rec
    const via = (): Result<{ level: string }, Invalid> => success(rec)
    declare const r: Result<typeof rec, Invalid>
    const widened: Result<{ level: string }, Invalid> = r // arrays, Promises too
    const lit = (): Result<{ a: number }, Invalid> => ({ a: 1, stack: 'trace' })
    const value = success({ id: 'x', stack: [1] })
    const loose: Result<object, Invalid> = value

**What B2 breaks in the opposite direction.** A `Success` whose value omits
`stack` no longer fits a `Result` whose value declares an optional `stack`
that cannot hold the branded string, a readonly one included. Through a
variable, these are TS2322 under B2 only:

    const noStack = success({ id: 'x' })
    const t: Result<{ id: string; stack?: number[] }, Invalid> = noStack
    const u: Result<{ id: string; readonly stack?: number[] }, Invalid> = noStack

**Two unsound reads under B2.** The `.stack` it adds is typed as the
brand or `undefined`, but `success` adds no property and checks none. Both
of these compile under B2 and throw at run time; on `main` they are
TS2339. The first hides the member behind a view; the second needs no
cast and no view, since an index signature can hold a `stack`:

    const actual = { id: 'x', stack: 42 }
    const view: { id: string } = actual
    success(view).stack?.toUpperCase()

    const counts = result<Record<string, number>, Invalid>({ stack: 42 })
    if (isSuccess(counts)) counts.stack?.toUpperCase()

**The suite.** Arms A and B fail two type tests, 16 diagnostics: the
fifteen residual pins in `never-defaults.test-d.ts` ("a raw Error
returned without failure() still compiles into the residual types"), and
the `URLSearchParams` pin in `api-surface.test-d.ts` ("a Success of an
object literal type fits an index signature"). Arm B2 fails only the
first (1239 of 1240, on `main` at ebe4841). Every other test
passes, the Box pins and the consumer declaration-emit test among them.
The probe's exported values emit declarations on every arm; the only
TS4023 is the spread of a `Success`, which fails on `main` too (the open
case the declaration-emit test pins).

**Unchanged by every arm.** Raw returns of a generic `T` and `success()`
of one fail on `main` already; `failure()` into any `Result` is untouched.

**Under `exactOptionalPropertyTypes`** (TypeScript 5.4.5, 5.9.3 and 7.0.2):
the `override stack = undefined` subclass cannot be declared (TS2415), on
`main` and B2 alike, and a raw `Error` into `Result<object, Invalid>`, open
on `main`, is closed under B2 (TS2375). A subclass that writes
`declare stack: never` stays legal and is admitted, on `main` and B2 alike.

**Not measured.** Compile time.
