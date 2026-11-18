import type { Maybe } from '../maybe/index.js'
import { curry } from '../fn/index.js'
import { describeThrown } from '../internal/describe-thrown.js'
import { isError, isErrorPrototype } from '../internal/is-error.js'
import type { CurryableMapper, Mapper } from '../fn/index.js'
/* The phantom-handle symbols and their readers live in ./internal.ts — a
   module deliberately absent from the exports map — so `/result/box` can
   restate member types with them without them becoming public API. */
import type {
  _value,
  _error,
  ValueOf,
  ErrorOf,
  ErrorArmOf,
} from './internal.js'

/* Captured when the module loads: the function-inspection intrinsics that
   `isClassLike` and `isUsableClass` call. `regExpExec` is
   `RegExp.prototype.exec` bound to `call`, and `functionHasInstance` is
   `Function.prototype[Symbol.hasInstance]`. */
const sourceOf: (candidate: unknown) => string =
  // eslint-disable-next-line @typescript-eslint/unbound-method -- bound at once
  Function.prototype.call.bind(Function.prototype.toString)
const regExpExec: (pattern: RegExp, source: string) => unknown =
  // eslint-disable-next-line @typescript-eslint/unbound-method -- bound at once
  Function.prototype.call.bind(RegExp.prototype.exec)
const functionHasInstance: unknown = Function.prototype[Symbol.hasInstance]
const getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor

declare const _phantom: unique symbol

/**
 * The phantom markers of a {@link SuccessArm}: `SuccessArm<T, E>` is `T`
 * without its `Error`, `null`, `undefined` and `void` members, intersected
 * with `SuccessMarkers<T, E>`.
 */
export type SuccessMarkers<T, E extends Error> = {
  readonly [_phantom]?: E
  readonly [_value]?: T
  readonly [_error]?: never
}

/**
 * The phantom markers of a {@link Failure}: `Failure<T, E>` is `E`
 * intersected with `FailureMarkers<T, E>`.
 */
export type FailureMarkers<T, E extends Error> = {
  readonly [_phantom]?: T
  readonly [_error]?: E
}

/**
 * The value-carrying case of a {@link Result}, unboxed — a `Success<T>`
 * *is* the `T`. A `Success` can never itself be an `Error`: an `Error`
 * member of `T` is dropped (see docs/adr/0001-unboxed-maybe-and-result.md).
 * A `null`, `undefined` or `void` member of `T` is a bare arm of its own,
 * with no phantom markers, so `Success<undefined, E>` is `undefined` for
 * every `E`.
 */
export type Success<T, E extends Error = Error> =
  SuccessArm<T, E> | NoInfer<Extract<T, null | undefined | void>>

/**
 * The marked part of a {@link Success}: `T` without its `Error`, `null`,
 * `undefined` and `void` members, carrying the phantom markers. A `Success`
 * is a `SuccessArm` or a bare nullish member of `T`.
 */
export type SuccessArm<T, E extends Error = Error> = Exclude<
  T,
  Error | null | undefined | void
> &
  SuccessMarkers<T, E>

/**
 * The `Error`-carrying case of a {@link Result}, unboxed — a `Failure` *is*
 * the `Error`, keeping its concrete subclass so a caller can branch on the
 * specific error type it was given.
 */
export type Failure<T, E extends Error = Error> = E & FailureMarkers<T, E>

/**
 * The outcome of a fallible operation: either a {@link Success} carrying
 * the value or a {@link Failure} carrying an `Error`, discriminated by
 * `Error.prototype` being on the value's prototype chain. Unlike `Maybe`, a
 * `Result` genuinely cannot nest: `Result<Result<T>>` is a distinct type, not
 * assignable back to `Result<T>` — see
 * docs/adr/0001-unboxed-maybe-and-result.md.
 */
export type Result<T, E extends Error = Error> = Success<T, E> | Failure<T, E>

/**
 * Wraps a value-or-error as a {@link Result}. Reach for this at the
 * boundary where a `T | E` enters code that deals in `Result`.
 *
 * Without type arguments the value's type splits: its `Error` members
 * form the error arm, and the rest the value arm. A member that may hide
 * an `Error` (an object type, `unknown`) keeps a plain `Error` in the
 * error arm; only a primitive, `null` or `undefined` contributes none.
 * With explicit type arguments, `result<T, E>` names both arms.
 */
export function result<V>(value: V): Result<Exclude<V, Error>, ErrorArmOf<V>>
export function result<T, E extends Error = Error>(value: T | E): Result<T, E>
export function result<T, E extends Error = Error>(value: T | E): Result<T, E> {
  return value as unknown as Result<T, E>
}

/**
 * Rejects a `success` value whose type can hold an `Error` at runtime, as
 * far as the type says so: a union with an `Error` member, a `Result` or
 * a `Failure`, a type the empty object fits (`unknown`, `object`, `{}`,
 * an all-optional object, an index-signature type such as `Record<string,
 * number>`, and any union of one of those with a primitive, `null` or
 * `undefined`), and a type a plain `Error` fits (`{ message: string }`, a
 * class whose members an `Error` has). Three things that can hold an
 * `Error` pass: `any`, as it passes every constraint; `void` (a
 * `() => Error` is assignable to a `() => void`); and an object type that
 * only an `Error` subclass fits (a plain interface, a DTO, a class
 * instance without private members). With an explicit type argument it
 * judges the argument, not the value. An unresolved type parameter is
 * refused, so generic code casts instead. See
 * docs/adr/0001-unboxed-maybe-and-result.md.
 */
export type NotPossiblyAnError<T> = [Extract<T, Error>] extends [never]
  ? // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- `{}` is the point: a type the empty object fits admits any non-nullish value, an Error included
    {} extends T
    ? 'This value may be an Error — wrap it with result(), not success()'
    : Error extends T
      ? 'This value may be an Error — wrap it with result(), not success()'
      : unknown
  : 'This value may be an Error — wrap it with result(), not success()'

/**
 * Wraps a known-good value as a {@link Success}. Type parameters are
 * value-first: `success<Widget>(w)` names the value being wrapped.
 * {@link failure} orders its parameters the other way round. The error
 * type `E` defaults to `never` and is not inferred, so the result flows
 * into any `Result<T, E>`. A value whose type may be an `Error` is
 * refused with a message naming {@link result}.
 */
export function success<
  T extends NotPossiblyAnError<T>,
  E extends Error = never,
>(value: T): Success<T, NoInfer<E>> {
  return value as Success<T, E>
}

/**
 * Wraps a known error as a {@link Failure}. Type parameters are ordered
 * `<E, T>` — the reverse of {@link success} and of the `Result`/`Failure`
 * types themselves: `failure<MyError>(e)` names the error being wrapped,
 * leaving the phantom value type `T` at `never`, which is not inferred, so
 * the result flows into any `Result<T, E>` that admits `E`.
 */
export function failure<E extends Error, T = never>(
  error: E,
): Failure<NoInfer<T>, E> {
  return error
}

/**
 * Type guard: true when `value` is a {@link Success}, narrowing to it. A
 * value whose prototype chain cannot be read (a Proxy whose `getPrototypeOf`
 * trap throws, a revoked Proxy) counts as not an `Error`, so a `Success`.
 */
export function isSuccess<T, E extends Error = Error>(
  value: Result<T, E>,
): value is Success<T, E> {
  return !isError(value)
}

/**
 * Type guard: true when `value` is a {@link Failure}, narrowing to it. A
 * value whose prototype chain cannot be read (a Proxy whose `getPrototypeOf`
 * trap throws, a revoked Proxy) counts as not an `Error`, so not a `Failure`.
 */
export function isFailure<T, E extends Error = Error>(
  value: Result<T, E>,
): value is Failure<T, E> {
  return isError(value)
}

/**
 * The Error a failure value is wrapped in when it was not already an `Error`.
 * A {@link Failure} must carry an `Error`, and `throw` accepts anything at
 * all; this preserves whatever was thrown on `thrown`. Constructed by
 * {@link tryCatch}'s default handler. The asynchronous counterpart is
 * `promise/RejectionError`.
 */
export class ThrownError<T = unknown> extends Error {
  readonly thrown: T

  constructor(thrown: T, message?: string) {
    super(message ?? `threw ${describeThrown(thrown)}`)
    this.thrown = thrown
  }

  /**
   * Renders a failure value for a message without trusting it to be
   * renderable: the value may be a symbol, an object with a null prototype,
   * or one whose `toString` throws, and this never throws for any of them.
   */
  static describe(value: unknown): string {
    return describeThrown(value)
  }
}

/**
 * The class shape `catchOnly` and the `tryCatch` list accept beyond a public
 * `abstract new` signature: a function whose `prototype` is an `Error`, which
 * includes classes with a private constructor. {@link CheckedClasses}
 * narrows it.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type -- admits private-constructor classes
type ErrorClass = Function & { readonly prototype: Error }

/**
 * The instance type of an error class: read from its construct signature
 * when it has a public one, otherwise from its `prototype`.
 */
type InstanceOfClass<K> = K extends abstract new (...args: never[]) => infer I
  ? I
  : K extends { readonly prototype: infer P }
    ? P
    : never

/**
 * Whether `T` is `any` or holds `any` in a property, an index signature, an
 * array element or a function's return, within four levels of nesting. It does
 * not look inside a non-public member (`private`, `protected` or `#`). Resolves
 * to `true`, `false` or `boolean`; test it with `true extends`.
 */
type HasAny<T, Depth extends unknown[] = []> = 0 extends 1 & T
  ? true
  : Depth['length'] extends 4
    ? false
    : T extends readonly (infer Item)[]
      ? HasAny<Item, [...Depth, 0]>
      : T extends (...args: never[]) => infer Return
        ? HasAny<Return, [...Depth, 0]>
        : T extends object
          ? true extends {
              [P in keyof T]-?: HasAny<T[P], [...Depth, 0]>
            }[keyof T]
            ? true
            : false
          : false

/**
 * What a class `K` with no public construct signature is read as: refused
 * when it is callable, or when its `prototype`, where the instance type is
 * read from, holds `any` (see {@link HasAny}), as a generic class's does for
 * each type parameter; otherwise `K`. A refused class maps to a type that
 * says why.
 */
type CheckedPrototypeClass<K> = K extends (...args: never[]) => unknown
  ? never
  : true extends HasAny<InstanceOfClass<K>>
    ? {
        readonly 'This class has no public constructor and its prototype holds any, so its instance type cannot be read. Pass it as a constructor type that fixes its instance type: X as unknown as abstract new () => X, with the type arguments of X where it has them': K
      }
    : K

/**
 * Maps each class in `C` to itself, or to `never` when its instance type is
 * `any` or not an `Error`. Applied to the parameter of `catchOnly` and the
 * `tryCatch` list, it rejects arrow functions, methods, `Function`-typed
 * values and constructors of non-Error instances. A class with a public
 * construct signature is read from it; any other is read through
 * {@link CheckedPrototypeClass}.
 */
type CheckedClasses<C extends readonly unknown[]> = {
  [K in keyof C]: 0 extends 1 & InstanceOfClass<C[K]>
    ? never
    : InstanceOfClass<C[K]> extends Error
      ? C[K] extends abstract new (...args: never[]) => unknown
        ? C[K]
        : CheckedPrototypeClass<C[K]>
      : never
}

/**
 * Lifts a throwing function into one that returns a {@link Result}. The
 * default `errorHandler` keeps an `Error` as it was thrown, with its concrete
 * subclass intact, and wraps anything else in a {@link ThrownError}; supply
 * one to translate the caught error into a specific `Error` subclass, or to
 * recover from it.
 *
 * `errorHandler` returns a whole `Result`, not just an `Error`, so it may
 * also recover — turning a throw into a `Success`. A handler that returns a
 * bare `E` still satisfies it: every `E` is already a `Result<T, E>`. This
 * is the same handler shape `promise/resultify` takes for a rejection —
 * `tryCatch` and `resultify` are the synchronous and asynchronous forms of
 * one lift, and `promise/fail` and `promise/recoverWith` serve both.
 *
 * `fn` must resolve synchronously — see {@link NotAPromise}. Lift an async
 * operation with `promise/resultify` or `call/resultify` instead.
 *
 * Domain code can use `tryCatch(construct, catchOnly(InvalidValue))`
 * or the shorthand `tryCatch(construct, [InvalidValue, OtherError])`.
 * An explicit handler that is neither an array nor a function (`null` and
 * `undefined` included; only an absent argument selects the default handler)
 * throws a `TypeError` when `tryCatch` is called, and so does a function
 * that is a class (its source starts with `class`, an error class or not),
 * whose `prototype` is `Error.prototype` or inherits from it (`TypeError` and
 * the other built-in error constructors, an ES5-style error constructor, a
 * bound subclass of `Error`), or that is a built-in constructor: its source
 * ends `{ [native code] }` and its own `prototype` is an object whose own
 * `constructor` is not an ordinary function (missing, not a function, or with
 * native or class source). That covers `Map`, `Set`, `Promise`, `Number`,
 * `String`, `Date`, `Function`, `Object`, `Symbol` and the other built-ins,
 * those of another realm too, and a Proxy over one of them, over a class or
 * over a generator function. A Proxy over a plain function whose `prototype`
 * still has an ordinary function as its own `constructor`, and a native
 * function with no own `prototype` (`parseInt`, `Math.max`), are accepted. A
 * function whose inspection throws is refused as well. Not detected: a bound
 * `Error`, a bound built-in constructor, a bound ES5-style error constructor,
 * a bound class that is not an `Error` subclass, `Proxy`, and an ES5-style
 * error constructor from another realm. A handler bound with
 * `handler.bind(ctx)` is accepted. The default handler never throws: a value
 * whose prototype chain cannot be read (a Proxy whose `getPrototypeOf` trap
 * throws, a revoked Proxy), or that cannot be rendered, is wrapped in a
 * {@link ThrownError} like any other non-`Error`.
 *
 * Naming `E` explicitly requires supplying the handler that produces it:
 * `tryCatch(fn)` fixes `E = Error`, and no overload takes three type
 * arguments with one value argument.
 */
export function tryCatch<
  T extends NotAPromise<T>,
  Args extends unknown[],
  C extends readonly [
    abstract new (...args: never[]) => Error,
    ...(abstract new (...args: never[]) => Error)[],
  ],
>(
  fn: (...args: Args) => T,
  errors: C,
): (...args: Args) => Result<T, InstanceType<C[number]>>
export function tryCatch<
  T extends NotAPromise<T>,
  Args extends unknown[],
  C extends readonly [ErrorClass, ...ErrorClass[]],
>(
  fn: (...args: Args) => T,
  errors: CheckedClasses<C>,
): (...args: Args) => Result<T, InstanceOfClass<C[number]>>
export function tryCatch<T extends NotAPromise<T>, Args extends unknown[]>(
  fn: (...args: Args) => T,
): (...args: Args) => Result<T, Error>
export function tryCatch<
  T extends NotAPromise<T>,
  Args extends unknown[],
  E extends Error = Error,
>(
  fn: (...args: Args) => T,
  errorHandler: Mapper<unknown, Result<T, E>>,
): (...args: Args) => Result<T, E>
export function tryCatch<
  T extends NotAPromise<T>,
  Args extends unknown[],
  E extends Error = Error,
>(
  fn: (...args: Args) => T,
  ...errorHandler: [] | [Mapper<unknown, Result<T, E>> | readonly unknown[]]
): (...args: Args) => Result<T, E> {
  // An absent argument means the default handler; an explicit `undefined` or
  // `null` (an `undefined` from a circular CommonJS import) is a bad handler
  // and is refused below, never silently replaced by catch-everything.
  const handler =
    errorHandler.length === 0
      ? defaultHandler<T, E>()
      : handlerFrom<T, E>(errorHandler[0])
  return function (...args: Args) {
    try {
      return fn(...args) as Result<T, E>
    } catch (error) {
      return handler(error)
    }
  }
}

/* The implementation signature is still generic in `E`, so the default still
   needs the cast — but the handler-less overload pins `E = Error` at every
   call site that can reach it, which is what the cast then truthfully claims. */
function defaultHandler<T, E extends Error>(): Mapper<unknown, Result<T, E>> {
  return (error) =>
    (isError(error) ? error : new ThrownError(error)) as Failure<T, E>
}

function handlerFrom<T, E extends Error>(
  errorHandler: Mapper<unknown, Result<T, E>> | readonly unknown[],
): Mapper<unknown, Result<T, E>> {
  return Array.isArray(errorHandler)
    ? (catchOnly as (...classes: unknown[]) => Mapper<unknown, Result<T, E>>)(
        ...(errorHandler as readonly unknown[]),
      )
    : checkedHandler<T, E>(errorHandler)
}

/* Accepts a function as the handler and refuses everything else. An error
   class is a function too, but calling it either throws or builds a fresh
   error in place of the original, so it is refused as well. */
function checkedHandler<T, E extends Error>(
  handler: unknown,
): Mapper<unknown, Result<T, E>> {
  if (typeof handler !== 'function' || isClassLike(handler)) {
    throw new TypeError(
      'tryCatch requires an error handler function or a non-empty array of error classes',
    )
  }
  return handler as Mapper<unknown, Result<T, E>>
}

/* A function whose source starts with `class` (an error class or not), or
   whose `prototype` is `Error.prototype` or inherits from it (a built-in
   error constructor, which has native source, an ES5-style error
   constructor, or a bound Error subclass, which inherits its target's parent
   `prototype`), or that `isBuiltInConstructor` recognises. A function whose
   inspection throws is refused too. A bound function has no own `prototype`:
   a bound built-in constructor, a bound `Error`, a bound ES5-style error
   constructor (it inherits `Function.prototype`, which has no `prototype`)
   and a bound class that is not an Error subclass are not detected, and
   neither are `Proxy` and the native non-constructors (`parseInt`,
   `Math.max`). */
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type -- narrowed by typeof at the call site
function isClassLike(candidate: Function): boolean {
  try {
    if (isClassSource(sourceOf(candidate))) {
      return true
    }
    const prototype = (candidate as { prototype?: unknown }).prototype
    if (
      typeof prototype === 'object' &&
      prototype !== null &&
      isErrorPrototype(prototype)
    ) {
      return true
    }
    return isBuiltInConstructor(candidate)
  } catch {
    return true
  }
}

/* Whether the source text starts with `class`, not followed by a parameter
   list: a method named `class` has a `(` next, after any whitespace and block
   or line comments. */
function isClassSource(source: string): boolean {
  return (
    regExpExec(
      /^class(?=[\s{/])(?=((?:\s|\/\*[\s\S]*?\*\/|\/\/[^\n\r\u2028\u2029]*)*))\1(?!\()/,
      source,
    ) !== null
  )
}

/* Whether the source text ends `{ [native code] }`. */
function isNativeSource(source: string): boolean {
  return regExpExec(/\{\s*\[native code\]\s*\}\s*$/, source) !== null
}

/* Whether `candidate` has native source and an own `prototype` data property
   holding an object (`typeof` `'object'` or `'function'`, as
   `Function.prototype` is) whose own `constructor` data property is not an
   ordinary function: missing, not a function, or a function with native or
   class source. `Map`, `Number`, `Function`, `Symbol`, the typed-array and
   `Intl` constructors, `AsyncFunction`, `GeneratorFunction` and a foreign
   realm's built-ins qualify, and so does a Proxy over one of them or over a
   class or generator function. A Proxy over a plain function whose
   `prototype` still has an ordinary function as its own `constructor` does
   not qualify; one whose `prototype` is replaced by `{}`, or is an ES5-style
   subclass's (it has no own `constructor`), does. */
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type -- narrowed by typeof at the call site
function isBuiltInConstructor(candidate: Function): boolean {
  if (!isNativeSource(sourceOf(candidate))) return false
  const prototype: unknown = getOwnPropertyDescriptor(
    candidate,
    'prototype',
  )?.value
  if (
    (typeof prototype !== 'object' && typeof prototype !== 'function') ||
    prototype === null
  ) {
    return false
  }
  const constructor: unknown = getOwnPropertyDescriptor(
    prototype,
    'constructor',
  )?.value
  if (typeof constructor !== 'function') return true
  const source = sourceOf(constructor)
  return isNativeSource(source) || isClassSource(source)
}

/**
 * Asserts that `value` is a {@link Success}, returning it or throwing the
 * carried `Error` otherwise. Mirrors `maybe/assertJust`, but here the thrown
 * value is the `Failure` itself — there is no separate message to supply. A
 * value whose prototype chain cannot be read (a Proxy whose `getPrototypeOf`
 * trap throws, a revoked Proxy) counts as not an `Error`: it is returned, not
 * thrown.
 */
export function assertSuccess<T, E extends Error = Error>(
  value: T | E,
): Success<T, E> {
  if (isError(value)) {
    throw value
  }
  return value as Success<T, E>
}

/**
 * True when `T` is thenable — has a callable `then` — rather than requiring
 * the exact `Promise` interface: the same duck-typing `await` and
 * `Promise.resolve` themselves use, so a non-native thenable is caught too.
 */
type IsThenable<T> = T extends { then(...args: never[]): unknown }
  ? true
  : false

/**
 * True when any member of `R` is thenable. Distributes over the union so a
 * sync/async return type (`number | Promise<number>`) is caught by its
 * async arm, which the union as a whole would miss.
 */
type HasThenableArm<R> = [
  Extract<R extends unknown ? IsThenable<R> : never, true>,
] extends [never]
  ? false
  : true

/**
 * Rejects a callback return type unsuited to `map`, surfacing the
 * diagnostic as a readable string. Exported so its exact wording can be
 * pinned by type-level tests. Three shapes are rejected, each with its own
 * message:
 *
 * - `R` itself is an `Error` subclass — a `Success` can never be an `Error`
 *   (see docs/adr/0001-unboxed-maybe-and-result.md).
 * - `R` has a thenable arm — resolve with `promise/resultify` or
 *   `call/resultify` first.
 * - `R` has a `Failure` arm alongside other arms — the callback returns a
 *   {@link Result}, and `andThen` is the fix.
 */
export type NotAResult<R> = [R] extends [Error]
  ? 'A Success can never be an Error — see docs/adr/0001-unboxed-maybe-and-result.md'
  : [Extract<R, Error>] extends [never]
    ? HasThenableArm<R> extends true
      ? 'This callback returns a Promise (or thenable) — resolve it first with promise/resultify or call/resultify, then compose with .then()'
      : unknown
    : 'This callback returns a Result — use andThen, not map'

/**
 * Applies `fn` to a `Success`, passing a `Failure` through unchanged. `fn`
 * must return a plain, already-resolved value — not a `Result` and not a
 * `Promise`; both are compile errors (see {@link NotAResult}). Use
 * {@link andThen} to chain a second fallible step, or resolve an async one
 * first.
 *
 * Curryable: supply `value` to apply now, or omit it for a Mapper — decided
 * by arity, never by inspecting the value (see docs/adr/0003-currying.md).
 * The unapplied form stays *generic*: `T` and `E` bind at the eventual
 * application, not at `map(fn)`, so one `map(double)` slots into chains over
 * any error type without re-annotation. The applied form binds them from
 * `value` directly.
 */
export function map<A, U extends NotAResult<U>, T extends A, E extends Error>(
  fn: (value: A) => U,
  value: Result<T, E>,
): Result<U, E>
export function map<A, U extends NotAResult<U>>(
  fn: (value: A) => U,
): <T extends A, E extends Error = Error>(value: Result<T, E>) => Result<U, E>
export function map<A, U extends NotAResult<U>, T extends A, E extends Error>(
  fn: (value: A) => U,
  ...value: [] | [Result<T, E>]
): CurryableMapper<Result<T, E>, Result<U, E>> {
  return curry(
    (value: Result<T, E>) =>
      (isSuccess(value) ? result(fn(value)) : value) as unknown as Result<U, E>,
    ...value,
  )
}

/**
 * Applies `fn` to a `Failure`'s `Error`, passing a `Success` through
 * unchanged — {@link map}'s dual, over the other channel. The one
 * combinator that transforms the failure channel while staying in it:
 * {@link orElse} and {@link fallback} both end a chain by turning a
 * `Failure` into a `Success`, where `mapError` keeps the chain going as
 * a `Result`.
 *
 * `fn` shares the handler shape of {@link tryCatch}'s `errorHandler` and
 * `promise/resultify`'s rejection mapper: it returns a whole `Result`, so
 * it may recover by returning a `Success`, and a bare `F` satisfies it —
 * pure translation is just:
 *
 * ```ts
 * mapError((error: FetchError) => new WidgetError(error))
 * ```
 *
 * The result type tracks the arms `fn` actually has: a translating
 * callback yields `Result<T, F>`, a recovering one drops the error type it
 * recovered from.
 *
 * `fn` must resolve synchronously — see {@link NotAPromise}.
 *
 * `/maybe` has no counterpart: `Nothing` carries nothing to transform.
 *
 * Curryable: supply `value` to apply now, or omit it for a Mapper — decided
 * by arity, never by inspecting the value (see docs/adr/0003-currying.md).
 * Like {@link map}, the unapplied form stays generic: `T` and `E` bind at
 * the eventual application.
 */
export function mapError<
  A extends Error,
  R extends NotAPromise<R>,
  T,
  E extends A,
>(fn: (error: A) => R, value: Result<T, E>): Result<T | ValueOf<R>, ErrorOf<R>>
export function mapError<A extends Error, R extends NotAPromise<R>>(
  fn: (error: A) => R,
): <T, E extends A>(value: Result<T, E>) => Result<T | ValueOf<R>, ErrorOf<R>>
export function mapError<
  A extends Error,
  R extends NotAPromise<R>,
  T,
  E extends A,
>(
  fn: (error: A) => R,
  ...value: [] | [Result<T, E>]
): CurryableMapper<Result<T, E>, Result<T | ValueOf<R>, ErrorOf<R>>> {
  return curry(
    (value: Result<T, E>) =>
      (isFailure(value) ? fn(value) : value) as unknown as Result<
        T | ValueOf<R>,
        ErrorOf<R>
      >,
    ...value,
  )
}

/**
 * Lazy recovery from a `Failure`: `fn` receives the `Failure` and must
 * produce a `Success`, so the result is always a `Success`. Passes an
 * existing `Success` through without calling `fn`. Eager counterpart:
 * {@link orElse}. To transform the error while staying in the failure
 * channel, use {@link mapError}.
 *
 * Curryable: supply `value` to apply now, or omit it for a Mapper — decided
 * by arity, never by inspecting the value (see docs/adr/0003-currying.md).
 */
export function fallback<T, E extends Error>(
  fn: (error: Failure<T, E>) => Success<T, E>,
  value: Result<T, E>,
): Success<T, E>
export function fallback<T, E extends Error = Error>(
  fn: (error: Failure<T, E>) => Success<T, E>,
): (value: Result<T, E>) => Success<T, E>
export function fallback<T, E extends Error>(
  fn: (error: Failure<T, E>) => Success<T, E>,
  ...value: [] | [Result<T, E>]
): CurryableMapper<Result<T, E>, Success<T, E>> {
  return curry(
    (value: Result<T, E>): Success<T, E> =>
      isSuccess(value) ? value : fn(value),
    ...value,
  )
}

/**
 * Eager counterpart to {@link fallback}: substitutes `defaultValue` for a
 * `Failure`, discarding the error. `defaultValue` is not lazily computed —
 * reach for `fallback` when producing it has a cost worth avoiding on the
 * `Success` path.
 *
 * Curryable: supply `value` to apply now, or omit it for a Mapper — decided
 * by arity, never by inspecting the value (see docs/adr/0003-currying.md).
 */
export function orElse<T, E extends Error>(
  defaultValue: T,
  value: Result<T, E>,
): Success<T, E>
export function orElse<T, E extends Error = Error>(
  defaultValue: T,
): (value: Result<T, E>) => Success<T, E>
export function orElse<T, E extends Error>(
  defaultValue: T,
  ...value: [] | [Result<T, E>]
): CurryableMapper<Result<T, E>, Success<T, E>> {
  return curry(
    (value: Result<T, E>): Success<T, E> =>
      // `T` is unresolved here, so `success`'s guard cannot judge it. The
      // cast only skips the guard: `defaultValue` is typed `T`, and for
      // `T = unknown` it may be an Error, as it could be before the guard.
      isSuccess(value) ? value : (defaultValue as Success<T, E>),
    ...value,
  )
}

/**
 * Rejects a callback return type with a thenable arm (see
 * {@link HasThenableArm}). The diagnostic names the fix: resolve with
 * `promise/resultify` or `call/resultify` first, then compose with
 * `.then()`.
 *
 * Exported both so its exact wording can be pinned by type-level tests and
 * for `maybe/map`, which enforces the same synchronous-only rule. That
 * import is type-only, keeping the maybe/result boundary free of a runtime
 * cycle (see docs/adr/0001-unboxed-maybe-and-result.md).
 */
export type NotAPromise<R> =
  HasThenableArm<R> extends true
    ? 'This callback returns a Promise (or thenable) — resolve it first with promise/resultify or call/resultify, then compose with .then()'
    : unknown

/**
 * The linear-chaining form (see docs/adr/0001-unboxed-maybe-and-result.md):
 * like `map`, but `fn` itself returns a `Result` rather than a plain value,
 * so chaining a second fallible step never nests a `Result<Result<T>>`.
 * A `Failure` input short-circuits before `fn` ever runs, and `fn`'s own
 * failure propagates exactly like the input's. Unlike `maybe/andThen`,
 * this is genuinely distinct from `map`, not an alias of it.
 *
 * `fn` must resolve synchronously — see {@link NotAPromise}.
 *
 * Curryable: supply `value` to apply now, or omit it for a Mapper — decided
 * by arity, never by inspecting the value (see docs/adr/0003-currying.md).
 * Like {@link map}, the unapplied form stays generic — `T` and `E` bind at
 * the eventual application — and the applied form binds them from `value`.
 */
export function andThen<
  A,
  R extends NotAPromise<R>,
  T extends A,
  E extends Error,
>(fn: (value: A) => R, value: Result<T, E>): Result<ValueOf<R>, E | ErrorOf<R>>
export function andThen<A, R extends NotAPromise<R>>(
  fn: (value: A) => R,
): <T extends A, E extends Error = Error>(
  value: Result<T, E>,
) => Result<ValueOf<R>, E | ErrorOf<R>>
export function andThen<
  A,
  R extends NotAPromise<R>,
  T extends A,
  E extends Error,
>(
  fn: (value: A) => R,
  ...value: [] | [Result<T, E>]
): CurryableMapper<Result<T, E>, Result<ValueOf<R>, E | ErrorOf<R>>> {
  return curry(
    (value: Result<T, E>) =>
      (isSuccess(value) ? fn(value) : value) as unknown as Result<
        ValueOf<R>,
        E | ErrorOf<R>
      >,
    ...value,
  )
}

/**
 * Bridges from `Maybe` to `Result`: a `Just` becomes `Success`, `Nothing`
 * becomes a `Failure` carrying the supplied `error`. Reach for this at the
 * point an absent value needs to be reported as a specific failure reason
 * rather than silently propagated as `Nothing`.
 *
 * Curryable: supply `value` to apply now, or omit it for a Mapper — decided
 * by arity, never by inspecting the value: `fromMaybe(error, nothing())`
 * passes `undefined` as a real argument and produces the `Failure`, not
 * the Mapper (see docs/adr/0003-currying.md).
 *
 * The applied form's `value` is spelled `T | undefined` rather than
 * `Maybe<T>` so the compiler can infer `T` from it (see
 * docs/adr/0003-currying.md).
 */
export function fromMaybe<T, E extends Error>(
  error: E,
  value: T | undefined,
): Result<T, E>
export function fromMaybe<T, E extends Error = Error>(
  error: E,
): (value: Maybe<T>) => Result<T, E>
export function fromMaybe<T, E extends Error>(
  error: E,
  ...value: [] | [Maybe<T>]
): CurryableMapper<Maybe<T>, Result<T, E>> {
  // Inlined rather than calling `isNothing` from ../maybe: that guard is a
  // runtime import, and this bridge must stay type-only across the
  // maybe/result boundary or the two modules form a real import cycle
  // (see docs/adr/0001-unboxed-maybe-and-result.md).
  return curry(
    (value: Maybe<T>) =>
      // `T` is unresolved, so `success`'s guard cannot judge it; the cast
      // below already claims the whole Result.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Maybe<T>'s conditional can't reduce for generic T; see maybe/isJust
      (value === undefined ? failure(error) : value) as Result<T, E>,
    ...value,
  )
}

/**
 * Creates a handler that preserves instances of the supplied error classes
 * as Failures only when they are also instances of this realm's Error.
 * Rethrows every other value, including foreign-realm errors, unchanged.
 *
 * Each class must be an Error class (a private or protected constructor is
 * fine). At compile time, a callable with no construct signature is refused
 * even when it has an `Error` `prototype`, and a class with no public
 * constructor is refused when its `prototype` holds `any`, which a generic
 * class's does for each type parameter. The check does not look inside a
 * `Promise`, a `Set`, a function's parameters or a non-public member
 * (`private`, `protected` or `#`), or deeper than four levels, so a type
 * parameter used only there still reads as `any`. An empty list throws a
 * `TypeError` when the handler is created, and so does an entry that is not a
 * function, or whose inspection throws (a revoked proxy, a throwing
 * `Symbol.hasInstance` getter), or whose `Symbol.hasInstance` is neither
 * nullish nor callable, or that has no custom `Symbol.hasInstance`, own or
 * inherited, and either an object `prototype` without `Error.prototype` on its
 * chain (`Object`, `Map`, `Symbol`, a class that does not extend `Error`, a
 * bound subclass of `Map`), or no object `prototype` and source text that does
 * not end `{ [native code] }` (`undefined`, an arrow function, a method). A
 * function with no object `prototype` whose source ends `{ [native code] }` is
 * admitted: `Math.max`, `parseInt`, and a bound `Error`, `Object` or base class
 * (one declared without `extends`). A bound subclass of `Error` is admitted
 * through its inherited `prototype`, and a bound derived class that does not
 * extend `Error` is refused through it. A function from another realm is not
 * checked, and neither is an entry whose inherited `Symbol.hasInstance` comes
 * from another realm: it counts as a custom one and is admitted.
 *
 * Each entry is checked once, when the handler is created, and not again: an
 * entry changed afterwards (a reassigned `prototype`, a Proxy whose
 * `prototype` read changes) is matched by `instanceof` as it then stands, so
 * it can match errors it would have been refused for, and a programming bug
 * becomes a Failure. An entry that throws inside `instanceof` later, such as a
 * proxy revoked after the handler is created, counts as not matching. A match
 * after which the value is no longer an `Error` (a `Symbol.hasInstance` hook
 * that changes its prototype) is rethrown, not returned as a Failure.
 *
 * Use `tryCatch(construct, catchOnly(InvalidValue))` for domain code.
 */
export function catchOnly<
  C extends readonly [
    abstract new (...args: never[]) => Error,
    ...(abstract new (...args: never[]) => Error)[],
  ],
>(...classes: C): (error: unknown) => Failure<never, InstanceType<C[number]>>
export function catchOnly<C extends readonly [ErrorClass, ...ErrorClass[]]>(
  ...classes: CheckedClasses<C>
): (error: unknown) => Failure<never, InstanceOfClass<C[number]>>
export function catchOnly(
  ...classes: readonly unknown[]
): (error: unknown) => Failure<never, Error> {
  if (classes.length === 0) {
    throw new TypeError('catchOnly requires a non-empty list of error classes')
  }
  classes.forEach((candidate, index) => {
    if (!isUsableClass(candidate)) {
      throw new TypeError(
        `catchOnly entry ${index} is not an error class: it cannot be used with instanceof`,
      )
    }
  })
  return (error: unknown): Failure<never, Error> => {
    if (
      isError(error) &&
      isInstanceOfAny(error, classes) &&
      // a `Symbol.hasInstance` hook can change the value while it answers
      isError(error)
    ) {
      return failure<Error, never>(error)
    }
    throw error
  }
}

/* Checks the shape without calling the entry or its `Symbol.hasInstance` (an
   accessor getter or a Proxy get trap does run at creation). An entry is usable
   when it has a custom `hasInstance`, or an object `prototype` with
   `Error.prototype` on its chain, or no object `prototype` and native source. A
   `hasInstance` that is neither nullish nor callable refuses the entry,
   whatever its `prototype`. `Object`, `Symbol`, a plain `function () {}` and a
   class that does not extend `Error` are refused. A bound function has no own
   `prototype` and inherits its target's parent's: a bound Error subclass
   reaches `Error.prototype` and is admitted, a bound derived class that does
   not extend `Error` reaches another `prototype` and is refused, and a bound
   `Error`, `Object` or base class has none, and is admitted as a native
   function. A function from another realm inherits that realm's
   `Function.prototype[Symbol.hasInstance]`, so it counts as having a custom
   one. */
function isUsableClass(candidate: unknown): boolean {
  if (typeof candidate !== 'function') return false
  try {
    const hasInstance = (candidate as { [Symbol.hasInstance]?: unknown })[
      Symbol.hasInstance
    ]
    if (hasInstance !== undefined && hasInstance !== null) {
      if (typeof hasInstance !== 'function') return false
      if (hasInstance !== functionHasInstance) return true
    }
    const prototype = (candidate as { prototype?: unknown }).prototype
    if (typeof prototype === 'object' && prototype !== null) {
      return isErrorPrototype(prototype)
    }
    return isNativeSource(sourceOf(candidate))
  } catch {
    return false
  }
}

/* An entry that throws when used with `instanceof` (a revoked proxy, a
   `prototype` reassigned after creation, a throwing `hasInstance`) counts as
   not matching, so the caller rethrows the original error unless a later
   entry matches. Each entry is guarded on its own. */
function isInstanceOfAny(error: Error, classes: readonly unknown[]): boolean {
  for (let index = 0; index < classes.length; index++) {
    try {
      if (error instanceof (classes[index] as abstract new () => unknown)) {
        return true
      }
    } catch {
      // counts as not matching
    }
  }
  return false
}

/**
 * What `collect` accepts: an object of parts, a tuple or a list. Every member
 * is a part: a {@link Result}, or a plain value that passes through as a
 * Success. For example, a plain member `{ name: 'a', message: 'b' }` is typed
 * as an error and its value as `never` (open, #120 item 9).
 *
 * Open type questions: #120.
 */
export type Parts =
  | (Readonly<Record<string, unknown>> &
      Readonly<Record<symbol, never>> & { readonly __proto__?: never })
  | readonly unknown[]
  // makes a tuple literal infer as a tuple
  | readonly [unknown, ...unknown[]]

/**
 * The value `collect` returns on success: the parts with each member unboxed
 * and `readonly`, one level deep. `{ id: Result<PieceId, E1> }` reads as
 * `{ readonly id: PieceId }`, `[Result<A, E1>, Result<B, E2>]` as
 * `readonly [A, B]` and `Result<Position, InvalidCoordinate>[]` as
 * `readonly Position[]`. In code generic in a part's type, for example
 * `function lens<V>(rs: Result<V, InvalidId>[]): Result<number, InvalidId> {
 * return collect(rs, (xs) => xs.length) }` does not compile (open, #120 item
 * 12).
 *
 * Open type questions: #120.
 */
export type Collected<P> = P extends readonly unknown[]
  ? { readonly [K in keyof P]: ValueOf<P[K]> }
  : {
      readonly [K in keyof P as K extends string | number ? K : never]: ValueOf<
        P[K]
      >
    }

/**
 * The error type of `collect(parts)`: the union of the error types of its
 * parts.
 *
 * Open type questions: #120.
 */
export type Failed<P> = [
  P extends readonly unknown[]
    ? Exclude<{ [K in keyof P]: ErrorOf<P[K]> }[number], undefined>
    : | DeclaredErrors<P>[keyof DeclaredErrors<P>]
      | (string extends keyof P ? ErrorOf<P[string & keyof P]> : never)
      | (number extends keyof P ? ErrorOf<P[number & keyof P]> : never),
] extends [infer F extends Error]
  ? F
  : never

/* The declared members' errors, each through `ErrorOf` on its own, and then
   those of the string and number index signatures: indexing a type that has
   an index signature by its keys would read only the signature. */
type DeclaredErrors<P> = {
  [
    K in keyof P as K extends string | number
      ? string extends K
        ? never
        : number extends K
          ? never
          : K
      : never
  ]-?: ErrorOf<P[K]>
}

/* Called through local bindings, so they are the functions captured when
   the module loads: replacing one afterwards changes nothing here. The
   loops below use no iterator. The `TypeError` for a bad argument is built
   from the global `TypeError` when `collect` is called, so replacing that
   global changes what is thrown. */
const hasOwn = Object.hasOwn
const ownNames = Object.getOwnPropertyNames
const freeze = Object.freeze
const isArray = Array.isArray

/* The first Failure among the parts, or `undefined` when there is none (a
   Failure is an `Error`, so it is never `undefined` itself). A list is read
   by its own indices: every index below its length is visited, and a hole
   is skipped, not read; an object of parts by its own string keys,
   enumerable or not (`Object.getOwnPropertyNames`). */
function firstFailure(parts: object): Error | undefined {
  if (isArray(parts)) {
    for (let index = 0; index < parts.length; index++) {
      if (!hasOwn(parts, index)) continue
      const part: unknown = parts[index]
      if (isError(part)) return part
    }
    return undefined
  }
  const keys = ownNames(parts)
  for (let index = 0; index < keys.length; index++) {
    if (!hasOwn(parts, keys[index])) continue
    const part: unknown = (parts as Record<string, unknown>)[keys[index]]
    if (isError(part)) return part
  }
  return undefined
}

/**
 * Fans several parts in: the first {@link Failure} among them, or the parts
 * themselves as a {@link Success}. `parts` is an object of parts, a tuple or
 * a list; the Success type is {@link Collected} and the error type is
 * {@link Failed}, inferred with no annotation:
 *
 * ```ts
 * collect({ id: PieceId.from(dto.id), at: Position.from(dto.at) })
 * // Result<{ readonly id: PieceId; readonly at: Position },
 * //   InvalidPieceId | InvalidCoordinate>
 * ```
 *
 * In an Array `map`, pass `(r) => collect(r)`: `rows.map(collect)` compiles,
 * and throws a `TypeError` on the first row, since `map` passes the index as
 * `build`.
 *
 * The Success is the argument itself, not a copy, and `readonly` one level
 * deep: for example, a later change to the caller's object shows through,
 * and a frozen argument comes back frozen. An object of parts is read by its
 * own string keys: for example, a symbol-keyed or a `__proto__`
 * Result member is refused in the types. For example, an object of parts
 * passed through a narrower type is read by all its own string keys, so a
 * failing undeclared member's error is outside `Failed`: it comes back typed
 * as a declared error, or as the Success when no declared member has an
 * error type (open, #120 item 10). For example, a part typed `any`
 * makes the result `any`, and an object of parts typed as an interface (say
 * `interface Shape { id: Result<…> }`) is refused: use a type alias. For
 * example, `collect({ name: 'n', message: 'm', level: 1 })` is typed `never`,
 * and `success` refuses that value (open, #120 item 9).
 *
 * With a second argument, `build`, a Success runs `build` on the parts and
 * `collect` returns what it returns, a plain value or a Result. `build` is
 * typed from the parts: for example, a swapped `Id` and `Count` constructor
 * argument does not compile. `build` must resolve synchronously: for
 * example, an inline `async` arrow or function used as `build`, with no type
 * arguments, is refused (gaps: #120 items 6 and 11).
 *
 * `attempt` is the imperative counterpart.
 *
 * Open type questions: #120.
 */
export function collect<P extends Parts>(
  parts: P,
): Result<Collected<P>, Failed<P>>
export function collect<P extends Parts, R extends NotAPromise<R>>(
  parts: P,
  build: (parts: Collected<P>) => R,
): Result<ValueOf<R>, Failed<P> | ErrorOf<R>>
export function collect(
  parts: unknown,
  ...build: [] | [(parts: never) => unknown]
): unknown {
  if (typeof parts !== 'object' || parts === null) {
    throw new TypeError(
      'collect requires an object of parts, a tuple or a list',
    )
  }
  if (build.length > 0 && typeof build[0] !== 'function') {
    throw new TypeError('collect requires its build argument to be a function')
  }
  const failed = firstFailure(parts)
  if (failed !== undefined) return failed
  if (build.length === 0) return parts
  const fn = build[0] as (parts: object) => unknown
  return fn(parts)
}

/**
 * Unboxes a part inside an {@link attempt}, or leaves that `attempt` with the
 * part's Failure: `take(part)` is the part's value when it is a Success. For
 * example, under `E = InvalidId` a Result whose error is `InvalidCount` is
 * rejected when `InvalidCount` is not assignable to `InvalidId`, as when each
 * declares a `kind` of its own literal type. A Result whose value type is
 * `any` is itself `any`, and `take` accepts it whatever its error. The
 * rejection holds with no type argument: `take<any>(part)` is accepted (#120
 * item 5).
 *
 * Open type questions: #120.
 */
export type Take<E extends Error> = <
  R extends Result<unknown, E> | null | undefined | void,
>(
  part: R,
) => ValueOf<R>

/* True when `T` is structurally a `Generator` or an `AsyncGenerator`. `any`
   and `unknown` are not: nothing is known of them. */
type IsGenerator<T> = unknown extends T
  ? false
  : T extends
        | Generator<unknown, unknown, never>
        | AsyncGenerator<unknown, unknown, never>
    ? true
    : false

/**
 * The diagnostic for an `attempt` body that returns a generator, for example
 * the return type of a `function*` with no return annotation. The generator
 * counterpart of {@link NotAPromise}.
 *
 * Open type questions: #120.
 */
export type NotAGenerator<R> = [
  Extract<R extends unknown ? IsGenerator<R> : never, true>,
] extends [never]
  ? unknown
  : 'This body returns a generator — attempt runs its body to completion, so write a plain function'

/* The token a `take` given a Failure throws: one fresh, frozen object per
   throw, carrying that Failure. It is not an `Error`, so no `Error` check
   mistakes it for a Failure. It names its `attempt` by a private field. The
   class and its prototype are frozen when the module loads, and `attempt`
   calls the brand check through the binding captured then, so a body that
   catches a token can neither change it nor replace the check; a token a body
   did not receive cannot be built, as the owner is private to its `attempt`
   so that only it recognises the token. */
class Leave {
  readonly #owner: object
  readonly failure: Error

  constructor(owner: object, failure: Error) {
    this.#owner = owner
    this.failure = failure
    freeze(this)
  }

  static ownedBy(this: void, thrown: unknown, owner: object): thrown is Leave {
    return (
      typeof thrown === 'object' &&
      thrown !== null &&
      #owner in thrown &&
      thrown.#owner === owner
    )
  }

  static {
    freeze(this)
    freeze(this.prototype)
  }
}

const tokenOwnedBy = Leave.ownedBy

/**
 * Runs `body` with a `take` that unboxes a part or leaves the `attempt` with
 * the part's Failure. `attempt` returns `body`'s return value, or the
 * Failure of its own `take`'s leave. Of all attempts, only the
 * one whose `take` it was recognises the leave; any other throw that reaches
 * it propagates.
 *
 * ```ts
 * static from(
 *   dto: DoorDTO,
 * ): Result<Door, InvalidPieceId | InvalidCoordinate> {
 *   return attempt((take) =>
 *     new Door(take(PieceId.from(dto.id)), take(Position.from(dto.at))),
 *   )
 * }
 * ```
 *
 * For example, a `try`/`catch` in the body that does not rethrow, or a
 * `finally` that returns, swallows the leave. A {@link tryCatch} inside the
 * body turns a `take` given a Failure into a {@link ThrownError} with the
 * default handler,
 * gives a function handler the token, and lets the leave through with
 * `catchOnly` or a class list. A `take` given a Failure after its `attempt`
 * returned throws the token, which is not an `Error`. Under, for example, a
 * `Result<Id, InvalidId>` annotation, a `return failure(…)` in the body is a
 * type error: use `take(failure(…))`.
 *
 * `body` must resolve synchronously: for example, an inline `async` arrow or
 * function, or an inline `function*` with no return annotation, is refused
 * when no type arguments are given (gaps: #120 items 3 and 6).
 *
 * `collect` is the declarative counterpart.
 *
 * Open type questions: #120.
 */
export function attempt<
  T extends NotAPromise<T> & NotAGenerator<T>,
  E extends Error = Error,
>(body: (take: Take<E>) => T): Result<T, E> {
  const owner = {}
  const take = ((part: unknown): unknown => {
    if (isError(part)) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- the token is deliberately not an Error: no Error check mistakes it for a Failure
      throw new Leave(owner, part)
    }
    return part
  }) as Take<E>
  try {
    return body(take) as Result<T, E>
  } catch (thrown) {
    if (tokenOwnedBy(thrown, owner)) return thrown.failure as Failure<T, E>
    throw thrown
  }
}
