/* PROTOTYPE #101 — a standalone model of /result's Success arm, four ways,
   side by side. Open it in an editor: every `@ts-expect-error` marks a line
   the compiler rejects, so the file typechecks as written
   (`tsc --noEmit --strict --lib ES2022,DOM prototypes/101/example.ts`). `Now` is the shipped shape, `A` adds `stack?: never` to every
   Success, `B` adds it only to object members of T that declare no `stack`
   key, and `B2` is B with a branded string in place of `never`. The measured results on the real library are in README.md. */
/* eslint-disable */

declare const _phantom: unique symbol
type Markers<T, E> = { readonly [_phantom]?: [T, E] }
type Plain<T> = Exclude<T, Error | null | undefined | void>
type Nullish<T> = Extract<T, null | undefined | void>

// Now: the shipped shape.
type SuccessNow<T, E> = (Plain<T> & Markers<T, E>) | Nullish<T>
type ResultNow<T, E extends Error> = SuccessNow<T, E> | (E & Markers<T, E>)

// Arm A: every Success carries `stack?: never`, which a plain Error's
// `stack?: string` cannot fit.
type SuccessA<T, E> =
  (Plain<T> & Markers<T, E> & { readonly stack?: never }) | Nullish<T>
type ResultA<T, E extends Error> = SuccessA<T, E> | (E & Markers<T, E>)

// Arm B: the marker only on object members of T that declare no `stack`.
type StackMarked<U> = U extends object
  ? string extends keyof U
    ? U & { readonly stack?: never }
    : 'stack' extends keyof U
      ? U
      : U & { readonly stack?: never }
  : U
type SuccessB<T, E> = (StackMarked<Plain<T>> & Markers<T, E>) | Nullish<T>
type ResultB<T, E extends Error> = SuccessB<T, E> | (E & Markers<T, E>)

// Arm B2: arm B with a branded string for the marker. No Error's
// `string | undefined` stack fits it, and an optional string-typed key still
// fits a string-valued index signature (TypeScript ignores the `undefined`
// of an optional member there unless the member is `undefined` only).
type NotAnErrorStack = string & { readonly '#notAnErrorStack': true }
type StackMarked2<U> = U extends object
  ? string extends keyof U
    ? U & { readonly stack?: NotAnErrorStack }
    : 'stack' extends keyof U
      ? U
      : U & { readonly stack?: NotAnErrorStack }
  : U
type SuccessB2<T, E> = (StackMarked2<Plain<T>> & Markers<T, E>) | Nullish<T>
type ResultB2<T, E extends Error> = SuccessB2<T, E> | (E & Markers<T, E>)

class Invalid extends Error {
  readonly kind = 'Invalid' as const
}
const raw = new Error('forgot failure()')

/* ── 1. What the marker closes ─────────────────────────────────────────────
   A raw Error returned where a Result is expected, without failure(). Today
   it compiles for these T, and the caller's `isSuccess` then treats the
   Error as a value. */

const now1 = (): ResultNow<{ name: string }, Invalid> => raw // compiles: the residual
const now2 = (): ResultNow<Record<string, any>, Invalid> => raw // compiles: the residual
const now3 = (): ResultNow<object, Invalid> => raw // compiles: the residual

// @ts-expect-error — A closes it: Error's `stack?: string` does not fit `stack?: never`
const a1 = (): ResultA<{ name: string }, Invalid> => raw
// @ts-expect-error — A closes it
const a2 = (): ResultA<Record<string, any>, Invalid> => raw
// @ts-expect-error — A closes it
const a3 = (): ResultA<object, Invalid> => raw

// @ts-expect-error — B closes it too
const b1 = (): ResultB<{ name: string }, Invalid> => raw
// @ts-expect-error — B closes it too
const b2 = (): ResultB<Record<string, any>, Invalid> => raw
// @ts-expect-error — B closes it too
const b3 = (): ResultB<object, Invalid> => raw

// What no arm closes: `any`, `void`, and an Error hidden in a value's type.
const open1 = (): ResultA<any, Invalid> => raw
const hidden: { kind: 'Invalid' } = new Invalid()
const open2 = (): ResultA<{ kind: 'Invalid' }, Invalid> => hidden

// …and an Error subclass that narrows its own `stack` to `undefined`: every
// marker is optional, so it accepts `undefined` (from the review of ticket 94).
class Stackless extends Error {
  readonly code = 'other'
  override stack = undefined
}
const open3 = (): ResultB2<{ code: string }, Invalid> => new Stackless() // compiles on every arm
const castError = new Error() as Error & { code: string }
// @ts-expect-error — a plain Error cast to carry `code` is still rejected
const closed3 = (): ResultB2<{ code: string }, Invalid> => castError
void [open3, closed3]

/* ── 2. What arm A breaks: a value type with a `stack` member ──────────────
   `{ stack: Frame[] } & { stack?: never }` has a `stack` of type never, and
   TypeScript reduces the whole object to never: the Success arm vanishes,
   not just its `stack`. */

interface Frame {
  readonly fn: string
  readonly line: number
}
interface Trace {
  readonly id: string
  readonly stack: readonly Frame[]
}
declare const trace: Trace

const nowTrace = (): ResultNow<Trace, Invalid> => trace // fine today
// @ts-expect-error — A: a Trace is no longer a Result<Trace>
const aTrace = (): ResultA<Trace, Invalid> => trace
const bTrace = (): ResultB<Trace, Invalid> => trace // B: fine, Trace declares `stack`

declare const rA: ResultA<Trace, Invalid>
declare const isSuccessA: <T, E extends Error>(
  r: ResultA<T, E>,
) => r is SuccessA<T, E>
// @ts-expect-error — A: after isSuccess the value is `never`, so even `id` is gone
const idA = isSuccessA(rA) ? rA.id : ''

// An optional `stack` (a log record, a serialised error) survives as an
// object, but its `stack` is now `undefined` only.
interface LogRecord {
  readonly level: 'info' | 'warn'
  readonly stack?: string
}
declare const rLog: ResultA<LogRecord, Invalid>
// @ts-expect-error — A: `stack` is `never`/`undefined`, `.length` does not exist
const lenA = isSuccessA(rLog) ? rLog.stack?.length : 0

// B keeps both, and in exchange leaves a raw Error open for those T that
// declare `stack` and that a plain Error fits:
const bOpen = (): ResultB<{ message?: string; stack?: string }, Invalid> => raw // B: compiles, the residual stays

/* ── 3. What both arms break: a Success no longer fits a string-valued index
   signature, because `stack?: never` adds an optional (undefined) string key.
   ─────────────────────────────────────────────────────────────────────────── */

type Query = { q: string; page: string }
declare const qNow: SuccessNow<Query, Invalid>
declare const qA: SuccessA<Query, Invalid>
declare const qB: SuccessB<Query, Invalid>
new URLSearchParams(qNow) // fine today
// @ts-expect-error — A: `stack?: never` is `undefined`, not a string
new URLSearchParams(qA)
// @ts-expect-error — B: the same
new URLSearchParams(qB)

// B2 keeps the string-valued fit (ADR 0001's #99 amendment pins it)…
declare const qB2: SuccessB2<Query, Invalid>
new URLSearchParams(qB2) // B2: fine
// @ts-expect-error — B2 still closes the raw Error
const b2raw = (): ResultB2<{ name: string }, Invalid> => raw
// …and still breaks a non-string-valued one, as every arm does:
declare const nNow: SuccessNow<{ n: number }, Invalid>
declare const nB2: SuccessB2<{ n: number }, Invalid>
const countsNow: Record<string, number> = nNow // fine today
// @ts-expect-error — B2: the marker is a string, not a number
const countsB2: Record<string, number> = nB2

void [b2raw, countsNow, countsB2]
void [now1, now2, now3, a1, a2, a3, b1, b2, b3, open1, open2]
void [nowTrace, aTrace, bTrace, idA, lenA, bOpen]
