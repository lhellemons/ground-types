// ---- module stand-ins (copied from src/maybe, src/result) ----
type Just<T = unknown> = T extends undefined ? never : T
type Nothing<T = unknown> = T extends undefined ? never : undefined
type Maybe<T> = T extends undefined ? never : T | undefined
declare const _phantom: unique symbol
type Success<T, E extends Error = Error> = (T extends Error ? never : T) & {
  readonly [_phantom]?: E
}
type Failure<T, E extends Error = Error> = E & { readonly [_phantom]?: T }
type Result<T, E extends Error = Error> = Success<T, E> | Failure<T, E>
type HasThenableArm<R> = R extends PromiseLike<unknown> ? true : false
type NotAPromise<R> =
  HasThenableArm<R> extends true
    ? 'This callback returns a Promise (or thenable) — resolve it first with promise/resultify or call/resultify, then compose with .then()'
    : unknown

// ---- the two helpers the inventory introduces ----
type Present<R> = Just<Exclude<R, undefined>>
type Mapped<R, U> = [Exclude<R, undefined>] extends [never]
  ? Nothing<U>
  : U | Extract<R, undefined>

// ---- the declared surface ----
declare class MaybeBox<R> {
  private constructor()
  static from<T>(value: T | undefined): MaybeBox<Maybe<T>>
  static fromNullable<T>(value: T | null | undefined): MaybeBox<Maybe<NonNullable<T>>>
  static just<T>(value: T): MaybeBox<Just<T>>
  static nothing<T>(): MaybeBox<Maybe<T>>
  static fromResult<T, E extends Error = Error>(value: Result<T, E>): MaybeBox<Maybe<T>>

  /** @deprecated `isJust` asks about a value, not a Box — use `box.isJust()`. */
  static isJust(value: MaybeBox<unknown>): never
  static isJust<T>(value: Maybe<T>): value is Just<T>
  /** @deprecated `isNothing` asks about a value, not a Box — use `box.isNothing()`. */
  static isNothing(value: MaybeBox<unknown>): never
  static isNothing<T>(value: Maybe<T>): value is Nothing<T>
  static assertJust<T>(value: Maybe<T>, message?: string): Just<T>

  map<U extends NotAPromise<U>>(fn: (value: Present<R>) => U): MaybeBox<Mapped<R, U>>
  andThen<U extends NotAPromise<U>>(fn: (value: Present<R>) => U): MaybeBox<Mapped<R, U>>
  orElse(defaultValue: Present<R>): MaybeBox<Present<R>>
  fallback(fn: () => Present<R>): MaybeBox<Present<R>>
  assertJust(message?: string): MaybeBox<Present<R>>

  isJust(): this is MaybeBox<Exclude<R, undefined>>
  isNothing(): this is MaybeBox<Extract<R, undefined>>

  act(fn: (value: R) => void): this
  ifJust(fn: (value: Present<R>) => void): this
  ifNothing(fn: () => void): this

  unbox(): R
  unbox<U>(fn: (value: R) => U): U
  get value(): R
}
export const Maybe = MaybeBox

// ================= assertions =================
interface User { name: string }
declare const find: (id: string) => User | undefined
declare const log: (x: unknown) => void

type Eq<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
declare function expectType<Want>(): <Got>(g: Got) => Eq<Want, Got> extends true ? void : never

// 1. the headline chain: arm tracking through assertJust
expectType<Just<string>>()(Maybe.from(find('u')).assertJust('must exist').map((u) => u.name).value)
// 2. without assertJust the Nothing arm survives
expectType<Maybe<string>>()(Maybe.from(find('u')).map((u) => u.name).value)
// 3. just() enters as a Just and stays one
expectType<Just<string>>()(Maybe.just(find('u')!).map((u) => u.name).value)
// 4. nothing<T>() retains T and recovers faithfully
expectType<Just<User>>()(Maybe.nothing<User>().fallback(() => ({ name: 'anon' })).value)
// 5. orElse / fallback discharge Nothing
expectType<Just<string>>()(Maybe.from(find('u')).map((u) => u.name).orElse('anon').value)
// 6. fromNullable strips null
expectType<Maybe<string>>()(Maybe.fromNullable<string | null>(null).value)
// 7. fromResult discards the error
declare const r: Result<number, TypeError>
expectType<Maybe<number>>()(Maybe.fromResult(r).value)
// 8. unbox() and unbox(fn)
expectType<Maybe<string>>()(Maybe.from(find('u')).map((u) => u.name).unbox())
expectType<number>()(Maybe.from(find('u')).map((u) => u.name).unbox((v) => (v === undefined ? 0 : v.length)))
// 9. act / if* return this, keeping the held type
expectType<Just<string>>()(Maybe.just('x').act(log).ifJust(log).ifNothing(() => log('none')).value)
// 10. instance guard narrows the Box reference
const box = Maybe.from(find('u'))
if (box.isJust()) { expectType<User>()(box.value) }
// 11. isNothing narrows, and the collapsing clause holds on the result
const box2 = Maybe.from(find('u'))
if (box2.isNothing()) { expectType<Nothing<string>>()(box2.map((): string => 'x').value) }
// 11b. and the callback's parameter is `never` there - a known-Nothing cannot be mapped over
// @ts-expect-error
if (box2.isNothing()) { box2.map((u) => u.name) }
// 12. static guard still narrows an unboxed value
declare const v: Maybe<string>
if (Maybe.isJust(v)) { expectType<Just<string>>()(v) }
// 13. assertJust on a Nothing-only Box types as Box<never> - it always throws
if (box2.isNothing()) { expectType<never>()(box2.assertJust().value) }

// ---- things that must NOT compile ----
// 14. the poison overload is a SOFT signal per #41: it resolves and kills narrowing,
//     but is deliberately not a hard error.
expectType<never>()(Maybe.isJust(box))
// @ts-expect-error NotAPromise rejects an async callback
Maybe.from(find('u')).map(async (u) => u.name)
// @ts-expect-error orElse's default must match the held type
Maybe.from(find('u')).map((u) => u.name).orElse(0)
// @ts-expect-error ADR 0003: unbox(undefined) is an argument, not a zero-arg call
Maybe.from(find('u')).unbox(undefined)
// @ts-expect-error decision 5: there is no type binding to annotate with
const bad: Maybe = Maybe.from(find('u'))
// @ts-expect-error private constructor closes direct construction
new Maybe()
