/* PROTOTYPE #101 — a standalone model of /result's Success arm, four ways,
   side by side. Open it in an editor: every `@ts-expect-error` marks a line
   the compiler rejects, so the file typechecks as written
   (`tsc --noEmit --strict --lib ES2022,DOM prototypes/101/example.ts`).
   `Now` is the shipped shape, `A` adds `stack?: never` to every Success,
   `B` adds it only to object members of T that still fit it (a member
   that declares its own `stack`, public, private or protected, keeps its
   type), and `B2` is B with a branded string in place of `never`. The
   measured results on the real library are in README.md. */
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

// Arm B: an object member of T gets the marker only when it still fits the
// marked type. A member that declares its own `stack` does not fit, whether
// that `stack` is public, private or protected (`keyof` sees only the
// first); an index signature alone fits, so `Record<string, any>` is marked.
// The fit test is an alias of its own: nested in the `object` branch, `U`
// would read as `U & object`, which is `never` for a branded primitive.
type MarkB<U> = [U] extends [U & { readonly stack?: never }]
  ? U & { readonly stack?: never }
  : U
type StackMarked<U> = U extends object ? MarkB<U> : U
type SuccessB<T, E> = (StackMarked<Plain<T>> & Markers<T, E>) | Nullish<T>
type ResultB<T, E extends Error> = SuccessB<T, E> | (E & Markers<T, E>)

// Arm B2: arm B with a branded string for the marker. A `stack` typed
// `string | undefined`, as a plain Error's is, does not fit it, and an
// optional string-typed key still fits a string-valued index signature
// (TypeScript ignores the `undefined` of an optional member there unless
// the member is `undefined` only).
type NotAnErrorStack = string & { readonly '#notAnErrorStack': true }
type MarkB2<U> = [U] extends [U & { readonly stack?: NotAnErrorStack }]
  ? U & { readonly stack?: NotAnErrorStack }
  : U
type StackMarked2<U> = U extends object ? MarkB2<U> : U
type SuccessB2<T, E> = (StackMarked2<Plain<T>> & Markers<T, E>) | Nullish<T>
type ResultB2<T, E extends Error> = SuccessB2<T, E> | (E & Markers<T, E>)

class Invalid extends Error {
  readonly kind = 'Invalid' as const
}
const raw = new Error('forgot failure()')

/* ── 1. What the marker closes ─────────────────────────────────────────────
   A raw Error returned where a Result is expected, without failure(). Today
   it compiles for these T, letting an Error outside the declared E into the
   Result; at run time `isSuccess` still recognises it as a Failure. */

// Each compiles today: the residual.
const now1 = (): ResultNow<{ name: string }, Invalid> => raw
const now2 = (): ResultNow<Record<string, any>, Invalid> => raw
const now3 = (): ResultNow<object, Invalid> => raw

// @ts-expect-error — A closes it: `stack?: string` does not fit `never`
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

// A template-literal index that 'stack' matches is not a declared `stack`:
type TemplateIndexed = { [k: string]: any; [k: `sta${string}`]: any }
// @ts-expect-error — B2 closes it
const b2Template = (): ResultB2<TemplateIndexed, Invalid> => raw

// What no arm closes: `any`, `void`, and an Error hidden in a value's type.
const open1 = (): ResultA<any, Invalid> => raw
const hidden: { kind: 'Invalid' } = new Invalid()
const open2 = (): ResultA<{ kind: 'Invalid' }, Invalid> => hidden

// …and an Error subclass that narrows its own `stack` to `undefined`: every
// marker is optional, so it accepts `undefined` (review of ticket 94).
class Stackless extends Error {
  readonly code = 'other'
  override stack = undefined
}
class Quiet extends Error {
  override stack = undefined
}
// Both compile on every arm.
const open3 = (): ResultB2<{ code: string }, Invalid> => new Stackless()
const open4 = (): ResultB2<object, Invalid> => new Quiet()
const castError = new Error() as Error & { code: string }
// @ts-expect-error — a plain Error cast to carry `code` is still rejected
const closed3 = (): ResultB2<{ code: string }, Invalid> => castError

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
// B: fine, Trace declares `stack`
const bTrace = (): ResultB<Trace, Invalid> => trace

// An indexed type that declares `stack` keeps it too.
type IndexedTrace = { [key: string]: unknown; id: string; stack: number[] }
declare const indexed: IndexedTrace
const b2Indexed = (): ResultB2<IndexedTrace, Invalid> => indexed // fine

// A private or protected `stack` declares one as well, though `keyof` does
// not see it. Under A a private one makes the arm `never` and a protected
// one breaks raw returns; B and B2 keep both. A `#stack` is unaffected.
class PrivateEditor {
  private stack: number[] = []
  constructor(readonly text: string) {}
  depth(): number {
    return this.stack.length
  }
}
class ProtectedEditor {
  protected stack: number[] = []
  readonly text = ''
}
declare const pe: PrivateEditor
declare const pre: ProtectedEditor
// @ts-expect-error — A: the private `stack` reduces the arm to `never`
const aPrivate = (): ResultA<PrivateEditor, Invalid> => pe
// @ts-expect-error — A: the protected `stack` no longer fits the marker
const aProtected = (): ResultA<ProtectedEditor, Invalid> => pre
const b2Private = (): ResultB2<PrivateEditor, Invalid> => pe // fine
const b2Protected = (): ResultB2<ProtectedEditor, Invalid> => pre // fine

declare const rA: ResultA<Trace, Invalid>
declare const isSuccessA: <T, E extends Error>(
  r: ResultA<T, E>,
) => r is SuccessA<T, E>
// @ts-expect-error — A: after isSuccess the value is `never`, `id` is gone
const idA = isSuccessA(rA) ? rA.id : ''

// An optional `stack` (a log record, a serialised error) survives as an
// object, but its `stack` is now `undefined` only.
interface LogRecord {
  readonly level: 'info' | 'warn'
  readonly stack?: string
}
declare const rLog: ResultA<LogRecord, Invalid>
// @ts-expect-error — A: `stack` is `undefined` only, `.length` is gone
const lenA = isSuccessA(rLog) ? rLog.stack?.length : 0

// B keeps both, and in exchange leaves a raw Error open for those T that
// declare `stack` and that a plain Error fits. B compiles it:
type MessageStack = { message?: string; stack?: string }
const bOpen = (): ResultB<MessageStack, Invalid> => raw

/* ── 3. What B and B2 break: assignments between Results when only one
   value type declares `stack`. ───────────────────────────────────────── */

declare const withStackNow: SuccessNow<{ id: string; stack: number[] }, never>
declare const withStackB2: SuccessB2<{ id: string; stack: number[] }, never>
const widenNow: ResultNow<{ id: string }, Invalid> = withStackNow // fine
// @ts-expect-error — B2: `number[]` does not fit the marker's brand
const widenB2: ResultB2<{ id: string }, Invalid> = withStackB2

// The opposite direction, B2 only: a Success that omits `stack` into a
// Result whose value declares an optional `stack` the brand does not fit.
type OptStack = { id: string; stack?: number[] }
declare const noStackNow: SuccessNow<{ id: string }, never>
declare const noStackB2: SuccessB2<{ id: string }, never>
const intoNow: ResultNow<OptStack, Invalid> = noStackNow // fine
// @ts-expect-error — B2: the brand is not a `number[]`
const intoB2: ResultB2<OptStack, Invalid> = noStackB2

// B2's own cost: the `.stack` it adds is a promise `success` does not check.
// A value whose static type hides a real `stack` reads wrong: this compiles
// under B2 and throws at run time (TS2339 on `Now`, A and B).
declare const successB2: <T>(value: T) => SuccessB2<T, never>
const actual = { id: 'x', stack: 42 }
const view: { id: string } = actual
const unsound = () => successB2(view).stack?.toUpperCase()

/* ── 4. What A and B break: a Success no longer fits a string-valued index
   signature, because `stack?: never` adds an optional (undefined) key.
   ─────────────────────────────────────────────────────────────────────── */

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

void [now1, now2, now3, a1, a2, a3, b1, b2, b3, b2Template]
void [open1, open2, open3, open4, closed3]
void [nowTrace, aTrace, bTrace, b2Indexed, idA, lenA, bOpen]
void [aPrivate, aProtected, b2Private, b2Protected]
void [widenNow, widenB2, intoNow, intoB2, unsound]
void [b2raw, countsNow, countsB2]
