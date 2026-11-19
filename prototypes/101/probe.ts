/* PROTOTYPE #101 — copied into src/result/ by run.sh and typechecked there.
   Every line tagged `CASE:` is a probe; run.sh reports, per arm and per
   TypeScript version, which tagged lines raise a diagnostic.
   "closes:" cases are a raw Error returned where a Result is expected: a
   diagnostic means the arm rejects it (good).
   "breaks:" cases are legitimate code: a diagnostic means the arm breaks
   it (the cost). */
/* eslint-disable */
import { failure, isSuccess, result, success } from './index.js'
import type { Result, Success } from './index.js'

class Invalid extends Error {
  readonly kind = 'Invalid' as const
}
class Other extends Error {
  readonly code = 'other'
}
const raw = new Error('x')
const other = new Other('x')

// ---- what the marker closes: a raw Error returned without failure() ----
export const c1 = (): Result<object, Invalid> => raw // CASE: closes: object
export const c2 = (): Result<{ name: string }, Invalid> => raw // CASE: closes: { name: string }
export const c3 = (): Result<number | object, Invalid> => raw // CASE: closes: number | object
export const c4 = (): Result<{ name?: string }, Invalid> => raw // CASE: closes: { name?: string }
export const c5 = (): Result<
  Partial<{ name: string; port: number }>,
  Invalid
> => raw // CASE: closes: Partial<{ name; port }>
export const c6 = (): Result<{ message?: string; id?: number }, Invalid> => raw // CASE: closes: { message?; id? }
export const c7 = (): Result<Object, Invalid> => raw // CASE: closes: Object
export const c8 = (): Result<Record<string, any>, Invalid> => raw // CASE: closes: Record<string, any>
export const c9 = (): Result<{ [k: string]: any }, Invalid> => raw // CASE: closes: { [k: string]: any }
export const c10 = (): Result<Readonly<Record<string, any>>, Invalid> => raw // CASE: closes: Readonly<Record<string, any>>
export const c11 = (): Result<{ id?: string } & object, Invalid> => raw // CASE: closes: { id?: string } & object
export const c12 = (): Result<{ stack?: string }, Invalid> => raw // CASE: closes: { stack?: string }
export const c13 = (): Result<{ cause?: unknown }, Invalid> => raw // CASE: closes: { cause?: unknown }
export const c14 = (): Result<{ code: string }, Invalid> => other // CASE: closes: wrong subclass into { code: string }
export const c15 = (): Result<number | { name?: string }, Invalid> => raw // CASE: closes: number | { name?: string }
export const c16 = (): Result<number | Record<string, any>, Invalid> => raw // CASE: closes: number | Record<string, any>
export const c17 = (): Result<any, Invalid> => raw // CASE: closes: any (expected to stay open)
export const c18 = (fn: () => void): Result<void, Invalid> => fn() // CASE: closes: void (expected to stay open)
const hidden: { code: string } = other
export const c19 = (): Result<{ code: string }, Invalid> => success(hidden) // CASE: closes: Error hidden in a value's static type (expected to stay open)

// ---- what it breaks: value types with a `stack` member ----

// A call stack: a parsed trace a debugger or a log viewer returns.
interface Frame {
  readonly fn: string
  readonly line: number
}
interface Trace {
  readonly id: string
  readonly stack: readonly Frame[]
}
declare const trace: Trace
export const b1 = (): Result<Trace, Invalid> => trace // CASE: breaks: call stack, returned raw
export const b2 = (): Result<Trace, Invalid> => success(trace) // CASE: breaks: call stack, through success()
declare const rt: Result<Trace, Invalid>
export const b3 = isSuccess(rt) ? rt.stack.length : 0 // CASE: breaks: call stack, read after isSuccess
export const b4 = isSuccess(rt) ? rt.id : '' // CASE: breaks: call stack, read a sibling member

// An undo stack: an editor state a reducer hands back.
interface Command {
  readonly name: string
}
class Editor {
  constructor(
    readonly text: string,
    readonly stack: readonly Command[],
  ) {}
}
declare const editor: Editor
export const b5 = (): Result<Editor, Invalid> => editor // CASE: breaks: undo stack (class), returned raw
export const b6 = (): Result<Editor, Invalid> => success(editor) // CASE: breaks: undo stack (class), through success()
declare const re: Result<Editor, Invalid>
export const b7 = isSuccess(re) ? re.stack.at(-1) : undefined // CASE: breaks: undo stack (class), read after isSuccess
export const b8 = isSuccess(re) ? re.stack.at(-1)?.name : undefined // CASE: breaks: undo stack, member of an element

// A data structure named `stack`: a parser's state.
class Stack<T> {
  readonly items: T[] = []
  push(t: T): void {
    this.items.push(t)
  }
}
interface ParserState {
  readonly pos: number
  readonly stack: Stack<string>
}
declare const ps: ParserState
export const b9 = (): Result<ParserState, Invalid> => ps // CASE: breaks: parser state with a Stack, returned raw
declare const rp: Result<ParserState, Invalid>
export const b10 = isSuccess(rp) ? rp.stack.push('x') : undefined // CASE: breaks: parser state, call a method on stack
// The class itself is fine: it has no `stack` member.
declare const st: Stack<number>
export const b11 = (): Result<Stack<number>, Invalid> => st // CASE: breaks: a Stack class itself, returned raw

// An optional `stack`, as a serialised error or a log record carries one.
interface LogRecord {
  readonly level: 'info' | 'warn'
  readonly message: string
  readonly stack?: string
}
declare const lr: LogRecord
export const b12 = (): Result<LogRecord, Invalid> => lr // CASE: breaks: optional stack?: string, returned raw
export const b13 = (): Result<LogRecord, Invalid> => success(lr) // CASE: breaks: optional stack?: string, through success()
declare const rl: Result<LogRecord, Invalid>
export const b14 = isSuccess(rl) ? rl.stack?.length : undefined // CASE: breaks: optional stack, read after isSuccess

// A generic over `{ stack }`.
export function top<T extends { readonly stack: readonly unknown[] }>(
  r: Result<T, Invalid>,
) {
  return isSuccess(r) ? r.stack[0] : undefined // CASE: breaks: generic T extends { stack }, read after isSuccess
}

// Through result() and a union.
declare const traceOrInvalid: Trace | Invalid
export const b15 = result<Trace, Invalid>(traceOrInvalid) // CASE: breaks: call stack, through result()

// ---- the other cost: a Success of an object no longer fits a string-valued index signature ----
export const b16 = new URLSearchParams(success({ a: '1' })) // CASE: breaks: success({ a }) into Record<string, string>
const meta: Record<string, string | number> = success({ a: '1' }) // CASE: breaks: success({ a }) into Record<string, string | number>
export const b17 = meta
declare const sx: Success<{ a: string }, Invalid>
export const b18: Record<string, unknown> = sx // CASE: breaks: Success into Record<string, unknown> (expected fine)
export const b19 = { ...sx } // CASE: breaks: spread a Success, exported (fails on main too: the open spread case of the declaration-emit test)

// Failure is untouched.
export const f1 = (): Result<Trace, Invalid> => failure(new Invalid()) // CASE: breaks: failure() into Result<Trace>

// Generic code over a T the arm cannot see into.
export const g1 = <T extends { id: string }>(t: T): Result<T, Invalid> => t // CASE: breaks: generic T returned raw (fails on main too)
export const g2 = <T extends { id: string }>(t: T): Result<T, Invalid> =>
  success(t) // CASE: breaks: generic T through success() (fails on main too: the guard)
export const g3 = <T extends { id: string }>(r: Result<T, Invalid>) =>
  isSuccess(r) ? r.id : '' // CASE: breaks: generic T, read after isSuccess

// Index signatures with a non-string value type: the branded-string marker (b2)
// fits only string-valued ones.
export const i1: Record<string, number> = success({ n: 1 }) // CASE: breaks: success({ n: 1 }) into Record<string, number>
export const i2: Record<string, boolean> = success({ ok: true }) // CASE: breaks: success({ ok: true }) into Record<string, boolean>
export const i3: { [k: string]: string | undefined } = success({ a: '1' }) // CASE: breaks: success({ a }) into { [k]: string | undefined }
// The marker adds a member: `.stack` on a Success with no `stack` is TS2339 on main.
declare const sq: Success<{ q: string }, Invalid>
export const i4 = sq.stack // CASE: loosens: `.stack` readable on a Success of { q } (TS2339 on main)
