// Prototype for #45 — the Fn and Call Box member inventories, typechecked.
// Same technique as prototype/maybe-box-surface.ts (#43): module stand-ins,
// the declared surface with no bodies, then assertions.

// ---- module stand-ins (copied from src/fn, src/call, src/promise, src/result) ----
type Fn<Return = unknown, Args extends unknown[] = unknown[]> = (
  ...args: Args
) => Return
type Mapper<T, U> = (t: T) => U

declare const _phantom: unique symbol
type Success<T, E extends Error = Error> = (T extends Error ? never : T) & {
  readonly [_phantom]?: E
}
type Failure<T, E extends Error = Error> = E & { readonly [_phantom]?: T }
type Result<T, E extends Error = Error> = Success<T, E> | Failure<T, E>

declare class AbortablePromise<T> extends Promise<T> {
  abort(): void
  detach(): AbortablePromise<T>
}

type Call<O = void, I = void> = (input: I) => O | Promise<O>
type AsyncCall<O = void, I = void> = (input: I) => Promise<O>
type AbortableCall<O = void, I = void> = (input: I) => AbortablePromise<O>

// ---- the helpers the inventory introduces ----
type AnyFn = (...args: never[]) => unknown
type AnyCall = (input: never) => unknown

/** compose prepends a step, which replaces the whole parameter list. */
type UnaryInput<R extends AnyFn> =
  Parameters<R> extends [infer A]
    ? A
    : 'compose prepends a step, replacing the whole parameter list — this function takes more than one argument; use .pipe to transform its return instead'

/** resultify builds its own plain promise, so an abort handle cannot survive it. */
type NotAbortable<R extends AnyCall> =
  ReturnType<R> extends AbortablePromise<unknown>
    ? 'This Call is already abortable — resultify would discard the abort handle; invoke it and lift its promise with promise/resultify instead'
    : unknown

type OutputOf<R extends AnyCall> = Awaited<ReturnType<R>>
type InputOf<R extends AnyCall> = Parameters<R>[0]

// ---- the declared surface: Fn ----
declare class FnBox<R extends AnyFn> {
  private constructor()

  static from<R extends AnyFn>(fn: R): FnBox<R>
  static identity<T>(): FnBox<Mapper<T, T>>
  static constant<T>(t: T): FnBox<(..._: unknown[]) => T>

  // Transforms the return, keeps the parameter list. Ladder goes to ten in
  // the shipped form, matching `pipe`; three is enough to pin the shape.
  pipe<U>(f1: Mapper<ReturnType<R>, U>): FnBox<(...args: Parameters<R>) => U>
  pipe<B, U>(
    f1: Mapper<ReturnType<R>, B>,
    f2: Mapper<B, U>,
  ): FnBox<(...args: Parameters<R>) => U>
  pipe<B, C, U>(
    f1: Mapper<ReturnType<R>, B>,
    f2: Mapper<B, C>,
    f3: Mapper<C, U>,
  ): FnBox<(...args: Parameters<R>) => U>

  // Prepends, right to left, unary subject only. Also to ten when shipped.
  compose<X, A extends UnaryInput<R>>(
    g1: Mapper<X, A>,
  ): FnBox<Mapper<X, ReturnType<R>>>
  compose<X, B, A extends UnaryInput<R>>(
    g1: Mapper<B, A>,
    g2: Mapper<X, B>,
  ): FnBox<Mapper<X, ReturnType<R>>>
  compose<X, B, C, A extends UnaryInput<R>>(
    g1: Mapper<C, A>,
    g2: Mapper<B, C>,
    g3: Mapper<X, B>,
  ): FnBox<Mapper<X, ReturnType<R>>>

  apply(...args: Parameters<R>): ReturnType<R>

  unbox(): R
  unbox<U>(fn: (fn: R) => U): U
  get fn(): R
}
export const Fn = FnBox

// ---- the declared surface: Call ----
declare class CallBox<R extends AnyCall> {
  private constructor()

  static from<R extends AnyCall>(call: R): CallBox<R>

  abortable(): CallBox<AbortableCall<OutputOf<R>, InputOf<R>>>
  resultify<E extends Error = Error>(
    mapRejection: Mapper<unknown, Result<OutputOf<R>, E>> & NotAbortable<R>,
  ): CallBox<AsyncCall<Result<OutputOf<R>, E>, InputOf<R>>>

  invoke(input: InputOf<R>): ReturnType<R>

  unbox(): R
  unbox<U>(fn: (call: R) => U): U
  get call(): R
}
export const CallClass = CallBox

// ================= assertions =================
interface User {
  name: string
}
declare const Id: unique symbol
type Id = string & { readonly [Id]: true }

declare const getName: (user: User) => string
declare const upper: (s: string) => string
declare const findUser: (id: Id) => User
declare const parseId: (s: string) => Id
declare const add: (a: number, b: number) => number
declare const fetchUser: (id: Id) => Promise<User>
declare const fail: (reason: unknown) => Result<User, TypeError>

type Eq<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false
// NB: #43's prototype spelled this as a return type (`=> Eq<...> extends true
// ? void : never`), which never fails — a `never`-typed call used as a
// statement is legal, so a wrong assertion passed silently. The check has to
// land in argument position to bite.
declare function expectType<Want>(): <Got>(
  g: Got,
  ...check: Eq<Want, Got> extends true ? [] : [{ want: Want; got: Got }]
) => void

// ---- Fn ----
// 1. the headline chain: pipe appends, left to right
expectType<string>()(Fn.from(getName).pipe(upper).apply({ name: 'a' }))
// 2. n-ary subject survives pipe — only the return is transformed
expectType<string>()(Fn.from(add).pipe(String).apply(1, 2))
// 3. multi-step pipe reads in data order
expectType<string>()(
  Fn.from(findUser).pipe(getName, upper).apply('x' as Id),
)
// 4. compose prepends, right to left: findUser runs first
expectType<string>()(Fn.from(getName).compose(findUser).apply('x' as Id))
// 5. n-ary compose keeps compose's direction — parseId runs first, then findUser
expectType<string>()(
  Fn.from(getName).compose(findUser, parseId).apply('x'),
)
// 6. compose then pipe: the mixed-direction chain is legal and runs g, f, h
expectType<string>()(
  Fn.from(getName).compose(findUser).pipe(upper).apply('x' as Id),
)
// 7. .fn hands back the reusable Mapper compose would have built
expectType<Mapper<Id, string>>()(Fn.from(getName).compose(findUser).fn)
// 8. identity and constant are nullary/unary statics returning Boxes
expectType<User>()(Fn.identity<User>().apply({ name: 'a' }))
expectType<number>()(Fn.constant(0).apply())
// 9. unbox() and unbox(fn)
expectType<(user: User) => string>()(Fn.from(getName).unbox())
expectType<number>()(Fn.from(getName).unbox((f) => f.length))

// ---- Call ----
// 10. the correct order: lift to a Result first, then wrap for a handle
expectType<AbortablePromise<Result<User, TypeError>>>()(
  CallClass.from(fetchUser).resultify(fail).abortable().invoke('x' as Id),
)
// 11. abortable alone
expectType<AbortablePromise<User>>()(
  CallClass.from(fetchUser).abortable().invoke('x' as Id),
)
// 12. resultify alone — an AsyncCall, plain promise, no handle
expectType<Promise<Result<User, TypeError>>>()(
  CallClass.from(fetchUser).resultify(fail).invoke('x' as Id),
)
// 13. .call hands the lifted Call back — the hard stop at Call
expectType<AbortableCall<Result<User, TypeError>, Id>>()(
  CallClass.from(fetchUser).resultify(fail).abortable().call,
)
// 14. a synchronous Call is boxed and lifted just the same
declare const lookup: (id: Id) => User
expectType<Promise<Result<User, TypeError>>>()(
  CallClass.from(lookup).resultify(fail).invoke('x' as Id),
)

// 15. the canonical Call shape — free to settle either way — collapses to its
//     output through OutputOf, so the lift is blind to which way it settled
declare const mayBeSync: Call<User, Id>
expectType<Promise<Result<User, TypeError>>>()(
  CallClass.from(mayBeSync).resultify(fail).invoke('x' as Id),
)

// ---- the overlap, recorded rather than closed ----
// 15. every Call is a function, so Fn accepts one — this is the sanctioned
//     crossing: leave, adapt the input, re-enter.
const adapted = Fn.from(lookup).compose(parseId).fn
expectType<Promise<Result<User, TypeError>>>()(
  CallClass.from(adapted).resultify(fail).invoke('x'),
)
// 16. and every Mapper is a Call, so Call accepts one
expectType<string>()(CallClass.from(getName).invoke({ name: 'a' }))

// ---- decision 5 degrades usefully here (note for #48) ----
// 17. `Fn` as an annotation is NOT an error: it resolves to the function type
//     from /fn, which is the type you wanted. Same for Call.
const asType: Fn<string, [number]> = (n: number) => String(n)
expectType<Fn<string, [number]>>()(asType)

// ---- things that must NOT compile ----
// @ts-expect-error 18. compose rejects an n-ary subject, by UnaryInput's message
Fn.from(add).compose(parseId)
// @ts-expect-error 19. the abort-discarding order is closed, by NotAbortable's message
CallClass.from(fetchUser).abortable().resultify(fail)
// @ts-expect-error 20. apply is pinned to the subject's parameter list
Fn.from(add).apply(1)
// @ts-expect-error 21. pipe's step must fit the subject's return type
Fn.from(getName).pipe(findUser)
// @ts-expect-error 22. compose's step must produce the subject's input
Fn.from(getName).compose(upper)
// @ts-expect-error 23. private constructor closes direct construction
new FnBox()
// @ts-expect-error 24. ADR 0003: unbox(undefined) is an argument, not a zero-arg call
Fn.from(getName).unbox(undefined)
