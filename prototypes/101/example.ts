/* PROTOTYPE #101 — a standalone model of /result's Success arm, three ways,
   side by side. Open it in an editor: every `@ts-expect-error` marks a line
   the compiler rejects, so the file typechecks as written (run.sh checks
   it). `Now` is the shipped shape, `A` adds `stack?: never` to every
   Success, `B` adds it only to object members of T that declare no `stack`
   key. The measured results on the real library are in README.md. */
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

void [now1, now2, now3, a1, a2, a3, b1, b2, b3, open1, open2]
void [nowTrace, aTrace, bTrace, idA, lenA, bOpen]
