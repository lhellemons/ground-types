// Prototype for #44 — the full Result Box surface, declared and typechecked
// before the inventory is written down (the #43/#45 method, with #49's
// realism: the functional side is the shipped /result, not a stand-in).
//
// This branch also carries the placement #44 chose: the phantom-handle
// symbols and ValueOf/ErrorOf now live in src/result/internal.ts — a module
// absent from the exports map, so consumers cannot import it — and
// src/result/index.ts type-only imports them. The whole existing suite runs
// green on that refactor, which is what proves the placement viable.
//
//   npx tsc --noEmit --strict --target es2022 --lib es2022,dom \
//     --module nodenext --moduleResolution nodenext \
//     prototype/result-box-surface.ts
//
// The class is spelled ResultBox here; the real /result/box file binds it
// value-only as `Result` per #38's mechanism and #48's one-name-both-meanings.

import { map as mapResult } from '../src/result/index.js'
import type {
  Failure,
  NotAPromise,
  NotAResult,
  Result,
  Success,
} from '../src/result/index.js'
import type { ErrorOf, ValueOf } from '../src/result/internal.js'
import { pipe } from '../src/fn/index.js'
import type { Mapper } from '../src/fn/index.js'

// ---- instruments (as #49) ----

declare class Err<N extends number> extends Error {
  readonly n: N
}
declare function step<N extends number>(
  n: N,
): (v: number) => Result<number, Err<N>>

type Eq<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false
// #45's corrected helper: the check must land in argument position to bite.
declare function expectType<Want>(): <Got>(
  g: Got,
  ...check: Eq<Want, Got> extends true ? [] : [{ want: Want; got: Got }]
) => void

// ================= the surface under test =================

declare class ResultBox<R> {
  private constructor()

  // ---- clause 1: ways in — statics returning a Box ----
  static from<T, E extends Error = Error>(value: T | E): ResultBox<Result<T, E>>
  // E defaults to never, diverging from the functional default (#44): a
  // known-good seed carries no error arm, so the chain's union holds exactly
  // what the links contribute — #49's riding-Error-arm wart cannot form.
  static success<T, E extends Error = never>(value: T): ResultBox<Success<T, E>>
  static failure<E extends Error, T = unknown>(
    error: E,
  ): ResultBox<Failure<T, E>>
  // #40: the crossing is inlined; the applied-form value is spelled
  // `T | undefined` per ADR 0003 so the compiler can infer T from it.
  static fromMaybe<T, E extends Error>(
    error: E,
    value: T | undefined,
  ): ResultBox<Result<T, E>>

  // ---- clause 3: guards and asserts on unboxed values, poison first ----
  /** @deprecated `isSuccess` asks about a value, not a Box — use `box.isSuccess()`. */
  static isSuccess(value: ResultBox<unknown>): never
  static isSuccess<T, E extends Error = Error>(
    value: Result<T, E>,
  ): value is Success<T, E>
  /** @deprecated `isFailure` asks about a value, not a Box — use `box.isFailure()`. */
  static isFailure(value: ResultBox<unknown>): never
  static isFailure<T, E extends Error = Error>(
    value: Result<T, E>,
  ): value is Failure<T, E>
  static assertSuccess<T, E extends Error = Error>(value: T | E): Success<T, E>

  // ---- instance predicates (#41) and the chaining assert ----
  isSuccess(): this is ResultBox<Exclude<R, Error>>
  isFailure(): this is ResultBox<Extract<R, Error>>
  assertSuccess(): ResultBox<Success<ValueOf<R>, ErrorOf<R>>>

  // ---- clause 2: transforms — restated, delegating (#42) ----
  map<U extends NotAResult<U>>(
    fn: (value: ValueOf<R>) => U,
  ): ResultBox<Result<U, ErrorOf<R>>>
  andThen<U extends NotAPromise<U>>(
    fn: (value: ValueOf<R>) => U,
  ): ResultBox<Result<ValueOf<U>, ErrorOf<R> | ErrorOf<U>>>
  mapError<S extends NotAPromise<S>>(
    fn: (error: ErrorOf<R>) => S,
  ): ResultBox<Result<ValueOf<R> | ValueOf<S>, ErrorOf<S>>>
  orElse(defaultValue: ValueOf<R>): ResultBox<Success<ValueOf<R>, ErrorOf<R>>>
  fallback(
    fn: (
      error: Failure<ValueOf<R>, ErrorOf<R>>,
    ) => Success<ValueOf<R>, ErrorOf<R>>,
  ): ResultBox<Success<ValueOf<R>, ErrorOf<R>>>

  // ---- side effects (#41, callback shapes per #50) ----
  act<S extends NotAPromise<S>>(fn: (value: R) => S): this
  ifSuccess<S extends NotAPromise<S>>(fn: (value: ValueOf<R>) => S): this
  ifFailure<S extends NotAPromise<S>>(fn: (error: ErrorOf<R>) => S): this

  // ---- terminals (#39 + #41) ----
  unbox(): R
  unbox<U>(fn: (value: R) => U): U
  get result(): R
}

// The Fn Box fragment #44 adds to #45's inventory: tryCatch as a clause-2
// instance method, the synchronous twin of Call's .resultify. The subject's
// return must be synchronous. A defaulted type parameter cannot gate this —
// TS never re-checks a default against its constraint at the call site — so
// the gate is a worded `this` parameter in the NotAbortable house style,
// which puts the wording in the TS2684 diagnostic even for the zero-arg call.
type AnyFn = (...args: never[]) => unknown

/**
 * Rejects a tryCatch subject that can return a thenable. A new worded guard
 * in the `UnaryInput`/`NotAbortable` house style — public on `/fn/box` per
 * #48's only-the-worded-guards rule, pinned by its message string.
 */
type NotAsync<R extends AnyFn> =
  NotAPromise<ReturnType<R>> extends string
    ? 'This function returns a Promise (or thenable) — tryCatch is the synchronous lift; use call/resultify or promise/resultify instead'
    : unknown

declare class FnBox<R extends AnyFn> {
  private constructor()
  static from<F extends AnyFn>(fn: F): FnBox<F>
  pipe<U>(f1: Mapper<ReturnType<R>, U>): FnBox<(...args: Parameters<R>) => U>
  tryCatch(
    this: NotAsync<R> extends string ? NotAsync<R> : FnBox<R>,
  ): FnBox<(...args: Parameters<R>) => Result<ReturnType<R>, Error>>
  tryCatch<E extends Error>(
    this: NotAsync<R> extends string ? NotAsync<R> : FnBox<R>,
    errorHandler: Mapper<unknown, Result<ReturnType<R>, E>>,
  ): FnBox<(...args: Parameters<R>) => Result<ReturnType<R>, E>>
  apply(...args: Parameters<R>): ReturnType<R>
  unbox(): R
  get fn(): R
}

// ================= 1. ways in =================

declare const userError: Err<1>

// 1: from is the boundary lift, both arms. Its inference is its
// counterpart's exactly — including the counterpart's quirk that a union
// argument lands wholly in T with E defaulted (naming E means naming both,
// same as the functional form) — pinned by parity, not by a guessed type.
import { result } from '../src/result/index.js'
const fromParity = result(0 as number | Err<1>)
expectType<ResultBox<typeof fromParity>>()(ResultBox.from(0 as number | Err<1>))
expectType<ResultBox<Result<number, Err<1>>>>()(
  ResultBox.from<number, Err<1>>(0),
)
expectType<ResultBox<Result<number, Error>>>()(ResultBox.from(0))

// 2: success seeds with an EMPTY error union (E = never) — the divergence
// #44 chose. The functional success(0) seeds Result<number, Error>.
const seed = ResultBox.success(0)
expectType<ResultBox<Success<number, never>>>()(seed)

// 3: …so a chain accumulates exactly the links' arms, no riding Error arm.
// (#49's margin wart, dead at the Box boundary.)
const accumulated = seed.andThen(step(1)).andThen(step(2)).unbox()
expectType<Result<number, Err<1> | Err<2>>>()(accumulated)

// 4: failure mirrors its counterpart, error-first, phantom T defaulted.
expectType<ResultBox<Failure<unknown, Err<1>>>>()(ResultBox.failure(userError))

// 5: fromMaybe, inlined crossing, applied form only (statics never curry).
expectType<ResultBox<Result<string, Err<1>>>>()(
  ResultBox.fromMaybe(userError, 'x' as string | undefined),
)

// ================= 2. transforms track the held type =================

declare const full: ResultBox<Result<number, Err<1> | Err<2>>>

// 6: map stays in the success channel; the error union is untouched.
const mapped = full.map((v) => String(v))
expectType<ResultBox<Result<string, Err<1> | Err<2>>>>()(mapped)
// …and its callback parameter is the success value, not the union.
full.map((v) => {
  expectType<number>()(v)
  return v
})

// 7: on the full held type the Box's map equals the applied functional form.
declare const fullUnboxed: Result<number, Err<1> | Err<2>>
const pipeMapped = pipe(
  fullUnboxed,
  mapResult((v: number) => String(v)),
)
expectType<typeof pipeMapped>()(mapped.unbox())

// 8: map on a Success-only Box does not re-admit a Failure arm — the
// phantom encoding collapses it (Failure<U, never> = never), no Mapped-style
// helper needed. This is the Result analogue of #43's finding, licensed by
// the amended parity rule.
declare const sure: ResultBox<Success<number, never>>
const sureMapped = sure.map((v) => String(v))
expectType<ResultBox<Result<string, never>>>()(sureMapped)
expectType<Eq<Result<string, never>, Success<string, never>>>()(
  true as const satisfies boolean,
)

// 9: andThen accumulates (spot check; depth is #49's settled business).
const four = full.andThen(step(3)).andThen(step(4)).unbox()
expectType<Result<number, Err<1> | Err<2> | Err<3> | Err<4>>>()(four)

// 10: mapError translates — arms collapse to the translation…
declare class Translated extends Error {
  readonly source: Err<1> | Err<2>
}
const translated = full.mapError((e) => {
  expectType<Err<1> | Err<2>>()(e)
  return new Translated()
})
expectType<ResultBox<Result<number, Translated>>>()(translated)

// 11: …and recovery empties the union, even from a defaulted success(0),
// because ErrorOf reads only the _error handle a Success never carries.
import { success } from '../src/result/index.js'
const recovered = full.mapError(() => success(0))
expectType<ResultBox<Result<number, never>>>()(recovered)

// 12: orElse holds a Success and says so (#39).
expectType<ResultBox<Success<number, Err<1> | Err<2>>>>()(full.orElse(0))

// 13: fallback likewise; the next link does NOT resurrect dead arms (#49's
// divergence, pinned here on the declared surface).
const afterFallback = full
  .fallback(() => success<number, Err<1> | Err<2>>(0))
  .andThen(step(5))
  .unbox()
expectType<Result<number, Err<5>>>()(afterFallback)

// ================= 3. guards, asserts, narrowing =================

declare const queried: ResultBox<Result<number, Err<1>>>

// 14: the instance predicates narrow the same class to a narrower argument.
if (queried.isSuccess()) {
  expectType<ResultBox<Success<number, Err<1>>>>()(queried)
  // …and a narrowed Box maps without re-admitting the Failure arm (8).
  expectType<ResultBox<Result<string, never>>>()(queried.map(String))
}
if (queried.isFailure()) {
  expectType<ResultBox<Failure<number, Err<1>>>>()(queried)
  // ifFailure hands the callback the narrowed error.
  queried.ifFailure((e) => {
    expectType<Err<1>>()(e)
  })
}

// 15: assertSuccess chains — not a terminal — and keeps the phantom channel.
expectType<ResultBox<Success<number, Err<1>>>>()(queried.assertSuccess())
// On a Failure-only Box the checker proves the assert always throws:
// Success<never, E> collapses to never (the #43 analogue).
declare const doomed: ResultBox<Failure<number, Err<1>>>
expectType<ResultBox<never>>()(doomed.assertSuccess())

// 16: the statics survive restatement — they narrow a raw, unboxed Result —
// and assertSuccess's inference is pinned by parity with its counterpart.
import { assertSuccess } from '../src/result/index.js'
declare const raw: Result<number, Err<1>>
if (ResultBox.isSuccess(raw)) {
  expectType<Success<number, Err<1>>>()(raw)
}
const assertParity = assertSuccess(raw)
expectType<typeof assertParity>()(ResultBox.assertSuccess(raw))
expectType<Success<number, Err<1>>>()(
  ResultBox.assertSuccess<number, Err<1>>(raw),
)

// 17: the poison overload catches a Box handed to the static — soft, per
// #41/#43: it compiles, resolves to never, and editors strike it through.
expectType<never>()(ResultBox.isSuccess(queried))
expectType<never>()(ResultBox.isFailure(queried))

// ================= 4. side effects and terminals =================

// 18: act receives the whole held union; the if* pair receive their arm;
// all three return this — the held type, narrowings included, survives.
const acted = queried
  .act((v) => {
    expectType<Result<number, Err<1>>>()(v)
  })
  .ifSuccess((v) => {
    expectType<number>()(v)
  })
  .ifFailure((e) => {
    expectType<Err<1>>()(e)
  })
expectType<typeof queried>()(acted)

// 19: the terminals: zero-arg unbox, the fold overload (#41), the getter.
expectType<Result<number, Err<1>>>()(queried.unbox())
expectType<string>()(queried.unbox((r) => String(r)))
expectType<Result<number, Err<1>>>()(queried.result)

// ================= 5. Fn.tryCatch (the #45 addendum) =================

declare function parseCount(s: string): number

// 20: zero-arg lift pins E = Error, like the functional handler-less form.
const lifted = FnBox.from(parseCount).tryCatch()
expectType<FnBox<(s: string) => Result<number, Error>>>()(lifted)
expectType<Result<number, Error>>()(lifted.apply('7'))

// 21: a handler translates — E is the handler's, and it may recover, since
// it returns a whole Result (the tryCatch/resultify handler shape).
const handled = FnBox.from(parseCount).tryCatch(() => new Err<9>())
expectType<FnBox<(s: string) => Result<number, Err<9>>>>()(handled)

// 22: the lift chains — it is a clause-2 member, not a terminal.
const pipedLift = FnBox.from(parseCount)
  .pipe((n) => n + 1)
  .tryCatch()
expectType<FnBox<(s: string) => Result<number, Error>>>()(pipedLift)

// ================= what must not compile =================

// @ts-expect-error — 23: a Result-returning callback: NotAResult names andThen.
full.map((v) => step(1)(v))

// @ts-expect-error — 24: an async callback: NotAResult's thenable arm.
full.map(async (v) => v)

// @ts-expect-error — 25: andThen rejects async through NotAPromise.
full.andThen(async (v) => success(v))

// @ts-expect-error — 26: act's callback must be synchronous too (#50).
full.act(async () => undefined)

// @ts-expect-error — 27: no static map — #42 dissolved the static curries;
// reaching for the free function on the class is a compile error.
ResultBox.map

// @ts-expect-error — 28: no static mapError either.
ResultBox.mapError

// 29: the lift is gated: an async subject cannot be tryCatch-ed, and the
// diagnostic carries NotAPromise's wording via the constraint. Use Call's
// .resultify instead — the same twin the functional docblocks point at.
declare function fetchCount(s: string): Promise<number>
// @ts-expect-error — Promise<number> fails NotAPromise's worded constraint
FnBox.from(fetchCount).tryCatch()

// 30: the wording itself, pinned (the same string NotAPromise carries).
expectType<'This callback returns a Result — use andThen, not map'>()(
  null as unknown as NotAResult<Result<number, Error>>,
)
