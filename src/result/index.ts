import type { Maybe } from '../maybe/index.js'
import { curry } from '../fn/index.js'
import type { CurryableMapper, Mapper } from '../fn/index.js'
/* The phantom-handle symbols and their readers live in ./internal.ts — a
   module deliberately absent from the exports map — so `/result/box` can
   restate member types with them without them becoming public API. */
import type { _value, _error, ValueOf, ErrorOf } from './internal.js'

declare const _phantom: unique symbol

/**
 * The value-carrying case of a {@link Result}, unboxed — a `Success<T>`
 * *is* the `T`. A `Success` can never itself be an `Error`: `T extends
 * Error` collapses to `never` (see docs/adr/0001-unboxed-maybe-and-result.md).
 */
export type Success<T, E extends Error = Error> = (T extends Error
  ? never
  : T) & { readonly [_phantom]?: E; readonly [_value]?: T }

/**
 * The `Error`-carrying case of a {@link Result}, unboxed — a `Failure` *is*
 * the `Error`, keeping its concrete subclass so a caller can branch on the
 * specific error type it was given.
 */
export type Failure<T, E extends Error = Error> = E & {
  readonly [_phantom]?: T
  readonly [_error]?: E
}

/**
 * The outcome of a fallible operation: either a {@link Success} carrying
 * the value or a {@link Failure} carrying an `Error`, discriminated by
 * `instanceof Error`. Unlike `Maybe`, a `Result` genuinely cannot nest:
 * `Result<Result<T>>` is a distinct type, not assignable back to
 * `Result<T>` — see docs/adr/0001-unboxed-maybe-and-result.md.
 */
export type Result<T, E extends Error = Error> = Success<T, E> | Failure<T, E>

/**
 * Wraps a value-or-error as a {@link Result}. Reach for this at the
 * boundary where a `T | E` enters code that deals in `Result`.
 */
export function result<T, E extends Error = Error>(value: T | E): Result<T, E> {
  return value as unknown as Result<T, E>
}

/**
 * Wraps a known-good value as a {@link Success}. Type parameters are
 * value-first: `success<Widget>(w)` names the value being wrapped.
 * {@link failure} orders its parameters the other way round.
 */
export function success<T, E extends Error = Error>(value: T): Success<T, E> {
  return value as Success<T, E>
}

/**
 * Wraps a known error as a {@link Failure}. Type parameters are ordered
 * `<E, T>` — the reverse of {@link success} and of the `Result`/`Failure`
 * types themselves: `failure<MyError>(e)` names the error being wrapped,
 * leaving the phantom channel defaulted.
 */
export function failure<E extends Error = Error, T = unknown>(
  error: E,
): Failure<T, E> {
  return error
}

/** Type guard: true when `value` is a {@link Success}, narrowing to it. */
export function isSuccess<T, E extends Error = Error>(
  value: Result<T, E>,
): value is Success<T, E> {
  return value instanceof Error === false
}

/** Type guard: true when `value` is a {@link Failure}, narrowing to it. */
export function isFailure<T, E extends Error = Error>(
  value: Result<T, E>,
): value is Failure<T, E> {
  return value instanceof Error === true
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
    super(message ?? `threw ${ThrownError.describe(thrown)}`)
    this.thrown = thrown
  }

  /**
   * Renders a failure value for a message without trusting it to be
   * renderable: the value may be a symbol, an object with a null prototype,
   * or one whose `toString` throws, and this never throws for any of them.
   */
  static describe(value: unknown): string {
    // `String` first: it is special-cased for symbols, where template
    // interpolation throws. `Object.prototype.toString` is the fallback; it
    // still reads `Symbol.toStringTag`, so a hostile Proxy can throw there
    // too, and the constant is the last resort.
    try {
      return String(value)
    } catch {
      try {
        return Object.prototype.toString.call(value)
      } catch {
        return '[object Unknown]'
      }
    }
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
 * Maps each class in `C` to itself, or to `never` when its instance type is
 * `any` or not an `Error`. Applied to the parameter of `catchOnly` and the
 * `tryCatch` list, it rejects arrow functions, methods, `Function`-typed
 * values and constructors of non-Error instances.
 */
type CheckedClasses<C extends readonly unknown[]> = {
  [K in keyof C]: 0 extends 1 & InstanceOfClass<C[K]>
    ? never
    : InstanceOfClass<C[K]> extends Error
      ? C[K]
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
 * A handler that is neither an array nor a function, or is a bare class,
 * throws a `TypeError` when `tryCatch` is called. The default handler never
 * throws: a value whose `instanceof Error` check throws, or that cannot be
 * rendered, is wrapped in a {@link ThrownError} like any other non-`Error`.
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
  errorHandler: Mapper<unknown, Result<T, E>> | readonly unknown[] = (error) =>
    // The implementation signature is still generic in `E`, so the default
    // still needs the cast — but the handler-less overload above pins
    // `E = Error` at every call site that can reach it, which is what the
    // cast then truthfully claims.
    (isError(error) ? error : new ThrownError(error)) as Failure<T, E>,
): (...args: Args) => Result<T, E> {
  const handler = Array.isArray(errorHandler)
    ? (catchOnly as (...classes: unknown[]) => Mapper<unknown, Result<T, E>>)(
        ...(errorHandler as readonly unknown[]),
      )
    : checkedHandler<T, E>(errorHandler)
  return function (...args: Args) {
    try {
      return fn(...args) as Result<T, E>
    } catch (error) {
      return handler(error)
    }
  }
}

/* `value instanceof Error`, except that a guard which throws (a Proxy whose
   `getPrototypeOf` trap throws) answers false instead, so the guard's own
   error never replaces the value being classified. */
function isError(value: unknown): value is Error {
  try {
    return value instanceof Error
  } catch {
    return false
  }
}

/* Accepts a function as the handler and refuses everything else. A bare
   class is a function too, but calling it throws on the error path, so a
   function whose source starts with `class` is refused as well. */
function checkedHandler<T, E extends Error>(
  handler: unknown,
): Mapper<unknown, Result<T, E>> {
  if (typeof handler !== 'function' || isBareClass(handler)) {
    throw new TypeError(
      'tryCatch requires an error handler function or a non-empty array of error classes',
    )
  }
  return handler as Mapper<unknown, Result<T, E>>
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type -- narrowed by typeof at the call site
function isBareClass(candidate: Function): boolean {
  return /^class\b(?!\s*\()/.test(Function.prototype.toString.call(candidate))
}

/**
 * Asserts that `value` is a {@link Success}, returning it or throwing the
 * carried `Error` otherwise. Mirrors `maybe/assertJust`, but here the thrown
 * value is the `Failure` itself — there is no separate message to supply.
 */
export function assertSuccess<T, E extends Error = Error>(
  value: T | E,
): Success<T, E> {
  if (value instanceof Error) {
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
      isSuccess(value) ? value : success<T, E>(defaultValue),
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
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Maybe<T>'s conditional can't reduce for generic T; see maybe/isJust
      (value === undefined ? failure(error) : success(value)) as Result<T, E>,
    ...value,
  )
}

/**
 * Creates a handler that preserves instances of the supplied error classes
 * as Failures only when they are also instances of this realm's Error.
 * Rethrows every other value, including foreign-realm errors, unchanged.
 *
 * Each class must be an Error class (a private constructor is fine). An
 * empty list throws a `TypeError` when the handler is created, and so does an
 * entry that is not a function, or is a non-native function with neither an
 * object `prototype` nor a custom `Symbol.hasInstance`, own or inherited
 * (such as `undefined`, an arrow function or a method), or an entry whose
 * inspection throws (a revoked proxy, a throwing `Symbol.hasInstance`
 * getter). A function is native when its source text says `[native code]`:
 * `Math.max`, `Symbol` and bound functions are admitted. An entry that throws
 * inside `instanceof` later, such as a proxy revoked after the handler is
 * created, counts as not matching.
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
    if (isError(error) && isInstanceOfAny(error, classes)) {
      return failure<Error, never>(error)
    }
    throw error
  }
}

/* Checks the shape without calling the entry or its `Symbol.hasInstance`
   (an accessor getter or a Proxy get trap does run at creation). A bound
   class has neither an own object `prototype` nor a custom `hasInstance`, so
   it is recognised by being a native function. */
function isUsableClass(candidate: unknown): boolean {
  if (typeof candidate !== 'function') return false
  try {
    const hasInstance = (candidate as { [Symbol.hasInstance]?: unknown })[
      Symbol.hasInstance
    ]
    if (
      typeof hasInstance === 'function' &&
      hasInstance !== Function.prototype[Symbol.hasInstance]
    ) {
      return true
    }
    const prototype = (candidate as { prototype?: unknown }).prototype
    if (typeof prototype === 'object' && prototype !== null) return true
    return /\[native code\]/.test(Function.prototype.toString.call(candidate))
  } catch {
    return false
  }
}

/* An entry that throws when used with `instanceof` (a revoked proxy, a
   `prototype` reassigned after creation, a throwing `hasInstance`) counts as
   not matching, so the caller rethrows the original error unless a later
   entry matches. Each entry is guarded on its own. */
function isInstanceOfAny(error: Error, classes: readonly unknown[]): boolean {
  return classes.some((ErrorClass) => {
    try {
      return error instanceof (ErrorClass as abstract new () => unknown)
    } catch {
      return false
    }
  })
}
