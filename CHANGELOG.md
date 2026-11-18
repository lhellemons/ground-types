# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Upgrading from 0.4.0: `success`, `failure` and `result` no longer need type
arguments in early-return code, and several calls that compiled now do not; some
calls also behave differently at run time. The entries marked **Breaking** below
list each break in ordinary use. The entries not marked change a run-time
outcome only in an edge case the entry names, such as a Proxy whose traps throw
or a revoked Proxy, a patched or replaced intrinsic, a `then` replaced or spied
on a single promise, a prototype swapped after the fact or an `abort()` that
throws, or they add fewer signal listeners than v0.4.0 did. TypeScript 5.4 or
later is required.

- `success(x)`, `failure(e)` and `result(x)` now infer at a site typed to a
  narrower `Result`: `(n: number): Result<number, Invalid> => success(n)`,
  `(): Result<number, A | B> => failure(new A())` and `(x: number | Invalid):
Result<number, Invalid> => result(x)` compile with no type arguments. A
  `Success` carries `E = never` and a `Failure` carries `T = never`, and both
  flow into any `Result<T, E>`. A plain `Error` is still rejected, through
  `failure`, `result` and `success`, where a narrower class is expected, and
  `Result<Result<T>>` is still not assignable to `Result<T>`. A raw `Error`
  returned without `failure()` still compiles where `T` is `object`, a union
  with `object`, an object type whose required members a plain `Error` has
  (`{ name: string }`), an all-optional object with a key `Error` has, typed
  so that `Error`'s member fits (`name`, `message`, `stack`, `cause`:
  `{ name?: string }`, `Partial<{ name: string; port: number }>`), `Object`,
  an `any`-indexed object (`Record<string, any>`, `{ [k: string]: any }`), an
  intersection with `object` (`{ id?: string } & object`), `any` (as `T` or
  as the returned expression), a raw `Error` subclass that fits a member type
  (an `Other` into `Result<{ code: string }, Invalid>`) or a union with any
  of these (`number | { name?: string }`), as before. `unknown`, `{}`,
  `Record<string, unknown>` and an all-optional object with no such key
  (`{ id?: string }`, `{ name?: number }`) reject it. A `void`-typed
  expression also compiles where `T` admits `void`, since the `void` arm
  below: `(f: () => void): Result<void, Invalid> => f()`.
- **Breaking:** `Success<undefined>`, `Success<null>` and `Success<void>` no
  longer reduce to `never`; each is the bare `undefined`, `null` or `void`,
  with no error phantom, and a nullish member of `T` is a Success arm of its
  own. So `success(undefined)` and `success(null)` are no longer assignable to
  every `Result`: `(): Result<User, Invalid> => success(undefined)` is now an
  error, while `Result<User | undefined, Invalid>`, `Result<void, Invalid>`
  and `Result<undefined, Invalid>` accept it. Narrowing a
  `Result<number | undefined, E>` with `!isFailure` or `isSuccess` keeps the
  `undefined` (it narrowed to `number` before, so the branch handling
  `undefined` was typed unreachable), and `Result<undefined, E>` is
  `undefined | Failure<undefined, E>` where it was the `Failure` alone.
  With `r: Result<number | undefined, E>`, `map((n: number) => n * 2, r)` and
  `andThen((n: number) => success(n), r)` are now errors, since the
  `undefined` reaches a callback that takes a number: annotate it
  `(n: number | undefined)`, or handle the `undefined` first (for `map` and
  `andThen` only). A nullish arm has
  no error phantom, so `map(f, success(undefined))` is `Result<number, Error>`
  where a value-carrying `success(x)` seeds `E = never`: a chain over
  `success(undefined)` does not reach a narrower `Result`, and neither
  `success<undefined, E>(undefined)` nor a declared seed nor `andThen(f,
success(undefined))` narrows `E`. Pass type arguments to the combinator
  (`map<undefined, number, undefined, Invalid>(f, success(undefined))`), use
  `result<undefined, Invalid>(undefined)`, or cast.
  A `Success` narrowed out of a `Result<number | undefined, E>`
  (`isSuccess(r) && r !== undefined`, `typeof r === 'number'`, `r!`) still
  carries `number | undefined` through a generic: `orElse(0, r)` and your own
  `unwrap<T, E>(x: Result<T, E>): T` no longer give a `number`, and
  `mapError(f, r)` widens back. So does ruling the `undefined` out of the
  whole `Result` first, for `orElse` and `fallback`. Pass type arguments
  (`orElse<number, Invalid>(0, r)`), rebind to a declared
  `Result<number, Invalid>`, or `map((n: number) => n, r)` first. Three
  cases were already errors on 0.4.0, so they are not regressions:
  `fallback(() => 0, r)` on the narrowed arm (its callback was typed
  `never`), `unwrap` after ruling the `undefined` out of the whole `Result`,
  and `unwrap` on a narrowed `string | null`. On TypeScript 7.0 the
  narrowed-arm `unwrap` and `mapError` were errors on 0.4.0 as well.
  `unknown` gets no nullish arm, so `(): Result<unknown, E> =>
success(undefined)` and `success(null)` no longer compile. Checked on
  TypeScript 5.4, 5.9 and 7.0.
- Add `SuccessArm`, the marked part of a `Success`, exported from `/result`:
  consumers whose declarations mention a `Success` need a name to emit.
- Add `SuccessMarkers` and `FailureMarkers`, exported from `/result`: the
  phantom markers of a `SuccessArm` and of a `Failure`, as named type
  aliases. A consumer with `declaration` on can now emit its own `.d.ts` for
  a function returning a `Success` narrowed by `typeof`
  (`isSuccess(u) && typeof u === 'number'`, with
  `u: Result<number | string, Invalid>`) or by `in` (`'id' in o`, with
  `o: Result<{ id: string } | { name: string }, Invalid>`), and for one
  returning a `Failure` narrowed by `instanceof` or by `in`; these failed
  with TS4023 or TS4058 before. An object spread still fails the same way,
  for a `Success` (`{ ...success({ id: 'x' }) }`, and `{ ...r, extra: 1 }`
  after `isSuccess(r)`) and for a `Failure`
  (`{ ...failure(new Invalid()) }`), and so does an object rest
  destructuring of a `Success` (`const { id, ...others } = r` after
  `isSuccess(r)`) or of a `Failure` (`const { code, ...others } = r` after
  `isFailure(r)`): give the exported value an explicit type, as the README
  shows. The narrowed cases are pinned in
  `test/declaration-emit/result.test.ts`, which also pins each spread and rest
  case as failing and each workaround as emitting.
- Add `collect` and `attempt` to `/result`, with the types `Collected`,
  `Failed`, `Take`, `Parts` and `NotAGenerator`: fan-in over unboxed
  Results. `collect(parts)` returns the first Failure among the parts, or
  the parts unboxed; `collect(parts, build)` runs `build` on the unboxed
  parts when none failed; `attempt((take) => …)` runs a body whose `take`
  unboxes a part or leaves the `attempt` with the part's Failure. Nothing
  that exists changes. Limits and open type questions: see the docblocks and
  #120.
- **Breaking:** TypeScript 5.4 or later is required, for `NoInfer` on the
  phantom position of `success` and `failure`.
- **Breaking:** `success` rejects, at any site and with or without type
  arguments, a value whose type may be an `Error`, with a message naming
  `result()`: a union with an `Error` member, a `Result` or `Failure`, a type
  the empty object fits (`unknown`, `object`, `{}`, an all-optional object
  such as `Partial<Config>`, an index-signature type such as
  `Record<string, number>`, a dictionary or a JSON type, or a union of one
  with a primitive, `null` or `undefined`) and a type a plain `Error` fits
  (`{ name: string }`, a class such as
  `class Tag { constructor(readonly name: string) {} }`).
  Wrap such a value with `result()`, or cast. Class instances, arrays, DTOs
  with a member no plain `Error` has, primitives and `undefined` pass. An
  object type that only an `Error` subclass fits, `any` and `void` also pass,
  and can hide an `Error`: a `() => Error` is assignable to `() => void`, so
  `(f: () => void): Result<void, Invalid> => success(f())` compiles.
- **Breaking:** `success` of an unresolved type parameter no longer compiles,
  constrained or not; cast, or wrap with `result()`.
- **Breaking:** `success(x)` is now `Success<T, never>`, where it was
  `Success<T, Error>`.
- **Breaking:** a variable seeded by an unannotated `failure(e)`, `success(x)`
  or `result(primitive)` takes the narrower type and rejects a later wider
  assignment: `let last = failure(new Invalid())` followed by `last = s` with
  `s: Failure<number, Invalid>`, and `let s = success(n)` with `n: number`
  followed by `s = x` with `x: Success<number, Invalid>`, no longer compile. Annotate the
  variable.
- **Breaking:** `failure<E>(e)` now has phantom `T = never`, where it had
  `unknown`.
- **Breaking:** the one-type-argument form `result<X>(v)` binds the new
  overload: `result<number>(5)` is `Result<number, never>`,
  `result<number>(x)` with `x: any` is too, and
  `result<number | Invalid>(x)` is `Result<number, Invalid>`.
- `SuccessArm` carries a third marker, `[_error]?: never`, so that no `Failure`
  can pass as a `Success`.
- Add `NotPossiblyAnError`, the type of `success`'s guard, exported from
  `/result`.
- `definePrimitiveValueObject` infers `E` from a handler written with
  `failure()` or `result()`, when it is given no type arguments.
- `catchOnly` and the `tryCatch` class-list shorthand now accept error classes
  with a private constructor, such as a domain error with a static factory.
  Arrow functions, methods, plain objects and constructors of non-`Error`
  instances are rejected at compile time. Calls that compiled before keep
  their inferred error type.
- **Breaking:** `catchOnly` (and so the `tryCatch` shorthand) now throws a
  `TypeError` when the handler is created, if the class list is empty or holds
  an entry that is not a function, or whose inspection throws (a revoked
  proxy, a throwing `Symbol.hasInstance` getter), or that has no custom
  `Symbol.hasInstance`, own or inherited, and either an object `prototype`
  without `Error.prototype` on its chain (`Object`, `Map`, `Symbol`, `Array`,
  `Promise`, `Date`, a class that does not extend `Error`, a function
  declaration, a bound subclass of `Map`), or no object `prototype` and source
  text that does not end `{ [native code] }` (`undefined`, an arrow function,
  a method). Before, an entry with no object `prototype` (`undefined`, an
  arrow function, a method) threw on the error path and replaced the original
  error, so a list holding one (an `undefined` from a circular CommonJS
  import) loaded on 0.4.0 and now throws at creation. `Object` matched every
  `Error`, so `catchOnly(Object)(new TypeError('bug'))` turned a programming
  bug into a Failure; the other entries with a non-Error object `prototype`
  matched nothing and rethrew every error. TypeScript already rejected all of
  them. Still admitted: an `Error` class or an ES5-style error constructor
  (`Legacy.prototype = Object.create(Error.prototype)`), a bound subclass of
  `Error`, a class with a custom `Symbol.hasInstance`, a function from another
  realm, and a function with no `prototype` of type object whose source ends
  `{ [native code] }`, such as `Math.max`, `parseInt`, `Function`, or a bound
  `Error`, `Object` or base class (one declared without `extends`): a bound
  `Object` still matches every `Error`. A function from another realm is not
  checked, and neither is an entry whose inherited `Symbol.hasInstance` comes
  from another realm (a function of this realm whose `[[Prototype]]` is
  another realm's `Function.prototype`): it counts as a custom one, so
  `catchOnly(N)` with `N.prototype = Object.prototype` is admitted and turns
  every error into a Failure. An entry is checked once, at creation, not
  again: one changed afterwards (a reassigned `prototype`, a Proxy whose
  `prototype` read changes) is matched by `instanceof` as it then stands, so it
  can match errors it would have been refused for, and a programming bug
  becomes a Failure. An entry that fails inside `instanceof` later, such as a
  proxy revoked after the handler is created, counts as not matching: the
  original error is rethrown unless a later entry matches.
- **Breaking:** `tryCatch` (and so `definePrimitiveValueObject`'s
  `errorHandler`) now throws a `TypeError` when called with a handler that is
  neither an array nor a function, or is a function that is a class (its source
  starts with `class`, an error class or not, so `class {}` and
  `class Foo extends Map {}` too), or whose `prototype` is `Error.prototype` or
  inherits from it (`Error`, `TypeError` and the other built-ins, an ES5-style
  error constructor, a bound subclass of `Error`), or that is a built-in
  constructor: its source ends `{ [native code] }` and its own `prototype` is an
  object whose own `constructor` is not an ordinary function (missing, not a
  function, or with native or class source). That covers `Map`, `Set`,
  `WeakMap`, `WeakSet`, `Promise`, `WeakRef`, `BigInt`, `Number`, `String`,
  `Boolean`, `Array`, `Date`, `RegExp`, `Symbol`, `Function`, `Object`,
  `ArrayBuffer`, the typed arrays, the `Intl` constructors, `AsyncFunction` and
  `GeneratorFunction`, those of another realm too, and a Proxy over one of them,
  over a class or over a generator function. A function whose inspection throws
  is refused as well. Before, any such function was accepted and called with the
  thrown value. `Map`, `Set`, `WeakMap`, `WeakSet`, `Promise`, `WeakRef`,
  `ArrayBuffer` and the typed arrays threw a TypeError ("Constructor Map
  requires 'new'") instead of the original error. `BigInt` threw a `SyntaxError`
  for a thrown `Error` and returned a bigint for a thrown integer. `Function`,
  `AsyncFunction`, `GeneratorFunction` and `RegExp` threw a `SyntaxError` or
  returned a Success, depending on the message (`new Error('boom')` gave a
  function or a regular expression, and `new Error('(')` threw from all four).
  For a thrown `Error`, `Number`, `String`, `Boolean`, `Array`, `Date` and
  `Symbol` returned a Success such as `NaN`, a string or an array, and so did
  `Intl.Collator`, `Intl.NumberFormat` and `Intl.DateTimeFormat` (the other
  `Intl` constructors threw "requires 'new'"). `Object` returned a thrown
  `Error` as a Failure, a working pass-through, and any other thrown value as a
  Success: a primitive boxed, `null` or `undefined` as `{}`, an object as
  itself. TypeScript already rejected `Map`, `Set`, `WeakMap`, `WeakSet`,
  `Promise`, `WeakRef`, `BigInt`, `RegExp`, `Symbol`, `Function`, `ArrayBuffer`,
  the typed arrays and the `Intl` constructors. It accepted `Object` for any
  `T`, and `Number`, `String`, `Boolean`, `Array` and `Date` for a `T` that
  their call returns, such as `any`. A Proxy over a plain function whose
  `prototype` still has an ordinary function as its own `constructor`, with or
  without an `apply` trap, a native function with no own `prototype`
  (`parseInt`, `Math.max`), a function whose own text merely mentions
  `[native code]`, and a handler bound with `handler.bind(ctx)` are accepted. A
  Proxy over a plain function whose `prototype` is replaced by `{}` or by
  `Object.create(null)`, is an ES5-style subclass's without an own
  `constructor`, or has a `constructor` that was deleted, made an accessor or
  set to a Proxy is refused, as a Proxy over a generator function is. Not
  detected: a bound `Error`, which returns a fresh `Error` as the Failure; a
  bound built-in constructor (`Map.bind(null)`, which throws "requires 'new'" on
  the error path, and `Number.bind(null)`, which returns a Success); a bound
  class that is not an `Error` subclass, which throws "cannot be invoked without
  'new'" there; a bound ES5-style error constructor, which returns `undefined`
  as a Success because a bound function inherits `Function.prototype` and
  reaches no `prototype`; `Proxy` itself, which throws "requires 'new'"; and an
  ES5-style error constructor from another realm, which returns `undefined` as a
  Success. TypeScript rejects the bound `Error`, `Map` and class and `Proxy`,
  and accepts `Number.bind(null)` and the bound ES5-style constructor. A foreign
  `class ... extends Error` is refused.
- When a value's prototype chain cannot be read (a Proxy whose
  `getPrototypeOf` trap throws, a revoked Proxy), `catchOnly` rethrows the
  original value and the default `tryCatch` handler wraps it in a
  `ThrownError`. `ThrownError` no longer throws while rendering a Proxy whose
  `get` trap throws.
- **Breaking:** `tryCatch(fn, undefined)` and
  `definePrimitiveValueObject(construct, undefined)` now throw a `TypeError`,
  and `definePrimitiveValueObject(construct, null)` does too. Only an absent
  argument selects the default handler; before, a falsy one silently selected
  the catch-everything default, and so an `undefined` from a circular
  CommonJS import still became catch-everything. Omit the argument, or pass a
  handler. TypeScript already rejected these.
- `promise/fail` wraps a rejection reason in a `RejectionError` when its
  prototype chain cannot be read (a Proxy whose `getPrototypeOf` trap
  throws), and `maybe/fromResult` keeps such a value as a `Just`. Before, the
  trap's error replaced the reason: `resultify(fail)(Promise.reject(proxy))`
  rejected with it.
- `result/isSuccess`, `isFailure` and `assertSuccess`, and so `map`, `mapError`,
  `fallback`, `orElse` and `andThen`, no longer throw when the value's prototype
  chain cannot be read (a Proxy whose `getPrototypeOf` trap throws, a revoked
  Proxy). Such a value counts as not an `Error`, as `maybe/fromResult`
  already treats it: `isSuccess` is true for it, `isFailure` false,
  `assertSuccess` returns it rather than throwing, and the combinators treat
  it as a `Success`. Before, the trap's error escaped: `map(x => x, proxy)`
  threw the trap's `RangeError`.
- The shared Error check used by `catchOnly`, the default `tryCatch` handler,
  `isSuccess`, `isFailure`, `assertSuccess`, `maybe/fromResult` and
  `promise/fail` now asks whether `Error.prototype` is on the value's prototype
  chain (`isPrototypeOf`) instead of using `instanceof`, so a defined
  `Error[Symbol.hasInstance]` is no longer consulted. Before, the exception of a
  hook that threw escaped from `isFailure`, `isSuccess` and the default
  `tryCatch` handler, and a hook that returned `true` made a non-`Error` count
  as one, so the default `tryCatch` handler and `promise/fail` passed a thrown
  or rejected non-`Error` through unwrapped. The answer is the same for every
  value without such a hook, including an `Error` from another realm (not an
  `Error`, as before). The check reads `Error.prototype`,
  `Function.prototype.call` and `Object.prototype.isPrototypeOf` once, when the
  module loads, and so do the `tryCatch` and `catchOnly` handler checks for
  `Function.prototype.toString`, `Function.prototype.call`,
  `Object.getOwnPropertyDescriptor` and `RegExp.prototype.exec`, and `catchOnly`
  for `Function.prototype[Symbol.hasInstance]`. Patching
  `Function.prototype.call`, `Function.prototype.toString`,
  `Object.prototype.isPrototypeOf`, `Object.getOwnPropertyDescriptor` or
  `RegExp.prototype.exec` afterwards, or replacing the global `Error` or
  `Function`, no longer changes an answer. That covers these intrinsics only:
  patching a built-in's `prototype.constructor` still bypasses the built-in
  check. `catchOnly` still matches a class by `instanceof`, so an entry inherits
  `Error`'s `Symbol.hasInstance` hook, if one is defined, like any other
  `instanceof` use.
- `abort/isAbortError` asks whether `DOMException.prototype`, read once when
  the module loads, is on the value's prototype chain (`isPrototypeOf`) instead
  of using `instanceof`, so a defined `DOMException[Symbol.hasInstance]` is no
  longer consulted. It answers `false` for a value on which its check throws,
  where it threw before: a Proxy whose `getPrototypeOf` trap throws, a revoked
  Proxy, and a Proxy over a real abort whose `name` is read through the proxy
  (no traps, or a `Reflect.get(target, key, receiver)` forwarder), as the
  platform's `name` getter rejects the proxy. A `get` trap that reads `name`
  with the target as receiver still answers `true`.
- **Breaking:** `AbortablePromise.of` no longer throws for a Proxy whose
  `getPrototypeOf` trap throws or for a revoked Proxy. For the first it resolves
  with the Proxy, or adopts it if it is a thenable, as `Promise.resolve` does.
  For a revoked Proxy it returns a promise rejected with a `TypeError`, as
  `Promise.resolve` does. Both threw synchronously. `of` and `resolve` are
  unchanged for a thenable whose `then` getter throws and for a promise whose
  `constructor` getter throws (`resolve` still throws synchronously for the
  second, as `Promise.resolve` does). This reaches `call/abortable`:
  `abortable(() => hostileProxy)()`, for a Proxy whose `getPrototypeOf` trap
  throws, fulfils with the Proxy, where it rejected with the trap's error.
- **Breaking:** the `resolve` an executor receives no longer throws when its
  argument cannot be adopted: a revoked Proxy, a thenable whose `then` getter
  throws, a promise whose `constructor` getter throws, a native promise whose
  own `then` throws. It rejects the promise with the error, as a native resolve
  function does. Before, the error was thrown to the caller of `resolve`: into
  the executor when `resolve` was called inside it, so that
  `new AbortablePromise(r => { try { r(revoked) } catch { r('fallback') } })`
  fulfilled with `'fallback'`, and to whoever called `resolve` later, in which
  case the promise stayed pending forever. A thenable Proxy whose
  `getPrototypeOf` trap throws is now adopted; before, the trap's error was
  thrown to the caller of `resolve` in the same two ways. An `AbortablePromise`
  whose prototype is such a Proxy is adopted too, and is not aborted with the
  outer promise; before, `resolve` threw.
- The `then` of a delegate, and the `constructor` of a promise delegate, are
  each read once, as `new Promise` reads them; before they were read twice. A
  `then` getter that throws only on its second read now makes the promise
  follow the delegate, as it does for `new Promise`.
- A delegate is followed with the `Promise` captured when the module loads: a
  global `Promise` replaced afterwards is not used, where `Promise.resolve` was
  called on the replacement when `resolve` ran. Likewise a
  `Promise.prototype.then` patched afterwards is not called while `resolve`
  runs, for a plain thenable, a native promise or an instance of a Promise
  subclass; before, it was called on the promise `Promise.resolve` made of the
  delegate, as `resolve` ran. With a patched `then` that throws, a promise
  resolved with a plain thenable, a promise from another realm, a subclass that
  overrides `then`, a thenable that wraps a native promise or an
  `AbortablePromise` was rejected with the error, or, for a `resolve` called
  after the executor returned, the error was thrown to its caller and the
  promise stayed pending; now it fulfils, as long as the patch is undone before
  the job that calls the delegate's `then` runs. With the patch still in place
  when that job runs, a plain thenable and a promise from another realm still
  fulfil, and a subclass that overrides `then`, a thenable that wraps a native
  promise and an `AbortablePromise` reject with the error. A native promise
  under the patch is rejected with the error: in the executor, as before; for a
  `resolve` called after the executor returned, where before the error was
  thrown to its caller and the promise stayed pending.
- A delegate's `then` is called at once when it is the `Promise.prototype.then`
  captured when the module loads, and from a job otherwise. Before, it was
  called at once when `Promise.resolve` returned the delegate as it was: a
  native promise of this realm whose `constructor` is `Promise`. A delegate that
  passes only the new test (a native promise whose `constructor` was replaced,
  other than one whose `constructor` getter throws, which rejects the promise,
  as the `resolve` entry above says; an instance of a Promise subclass that does
  not override `then`) is followed sooner, without the job that was queued for
  it, and the species constructor of a subclass, user code, runs before
  `resolve` returns. One that passes only the old test (such a native promise
  with its own `then` replaced or spied on, or any native promise once
  `Promise.prototype.then` has been patched after the module loaded) is followed
  later, through a job. Every other delegate is followed as it was, except while
  `Promise.prototype.then` is patched (see the entry above): a plain thenable,
  an `AbortablePromise`, a subclass that overrides `then`, a promise from
  another realm, a thenable that wraps a native promise.
- A delegate is followed before the upstream link to it is registered. Before,
  the link was registered first: for a `resolve` that came after the abort, the
  link fired at once, and when the delegate's `abort()` threw, the error reached
  the caller of `resolve` and the delegate was left with no handler, so its
  rejection was unhandled and ends a Node process. Now a delegate whose `then`
  is `Promise.prototype.then` has its handlers attached by then, and any other
  has a job queued that calls its `then`, which runs before a rejection is
  reported as unhandled; and a throw from a link that fires at once is dropped,
  since the promise is already settled. A delegate whose own `then` subscribes
  nothing is still unhandled, as before. A delegate is checked again when the
  promise is aborted: one whose prototype was swapped after `resolve` to one
  that does not inherit `AbortablePromise.prototype` and has no `abort()` made
  `abort()` throw a `TypeError`, and now is skipped, as is one swapped to a
  prototype that does not inherit `AbortablePromise.prototype` but has an
  `abort()`, which was called. One swapped to the prototype of a subclass of
  `AbortablePromise` is aborted, as before.
  `Object.create(AbortablePromise.prototype)`, as a delegate or as a member
  below, is skipped, where `abort()` threw a `TypeError`.
- Aborting the promise returned by `all`, `race`, `any` or `allSettled` aborts
  every `AbortablePromise` member whose `then` is a function on the one read
  `AbortablePromise` makes as it takes the member. A throw from one member's
  `abort()` no longer stops the loop: `abort()` is called on every member, then
  the first error is thrown, except when the combined promise was aborted while
  it was being made. For a subclass constructor that aborts `this`, that error
  is dropped, where `Sub.all()` threw it. An iterator that aborts the combined
  promise, which a subclass constructor can expose to it, is new with the lazy
  iteration below, and its error is dropped too: v0.4.0 took every item of
  `values` before it made the combined promise, so an iterator could not abort
  it, and `Sub.all()` threw nothing in that case. The links of one promise (a
  promise derived by `then` whose handler returns an `AbortablePromise` has a
  link to its source and one to that delegate) are fired the same way:
  `abort()` fires each link, then throws the first error. Before, the throw (a
  subclass's override, an `abort` assigned to the instance, a derived member
  whose upstream `abort()` throws) ended the loop and left the members after it
  running, and so did the trap of a Proxy whose `getPrototypeOf` throws, or a
  revoked Proxy, which are now skipped without `abort()` throwing. A member
  whose `then` was replaced by a non-function was taken by the combinator as a
  plain value, and one with a `then` getter that throws was taken as a member
  rejected with the getter's error: neither had a handler, and aborting it
  rejected it unhandled, which ends a Node process. They are no longer aborted.
  A member with a `then` function that subscribes nothing is still aborted, and
  unhandled, as before. A member whose prototype is swapped after the
  combinator was made is skipped when it is aborted, as it was before. A
  promise's signal listeners are released even when a link throws; before, they
  stayed on the signal until it aborted. A throw reached through a signal that
  aborts later (`abortOn`, a controller passed to the constructor, `peer`) is
  thrown inside the signal's event listener and so reported as an uncaught
  exception, as before; `abortOn` with a signal that has already aborted throws
  it to the caller of `abortOn`, as before.
- "Is an `AbortablePromise`", asked by `of`, the four combinators and an
  executor that resolves with a thenable, now asks whether the value carries the
  private field that only this class's constructor sets, and whether
  `AbortablePromise.prototype`, on its prototype chain, is found by
  `isPrototypeOf`, instead of using `instanceof`. `Symbol.hasInstance` of
  `AbortablePromise` is no longer consulted. A value whose chain cannot be
  walked is not one. The combinators and delegation call the member's
  `abort()`, as before: a subclass's override, an `abort` assigned or spied on
  the instance and a patched `AbortablePromise.prototype.abort` are called.
- **Breaking:** abort no longer reaches an `AbortablePromise` through a Proxy
  over it, including one whose `get` trap binds every method to the target.
  `AbortablePromise.all([proxy]).abort()`, `AbortablePromise.of(proxy).abort()`
  and `new AbortablePromise(r => r(proxy)).abort()` aborted the target for a
  binding Proxy and now leave it running; for a Proxy with no traps they threw
  a `TypeError` (the combinators and delegation) or returned the Proxy, whose
  `abort()` throws (`of`), and `of` now returns a new promise that rejects with
  a `TypeError`, as `Promise.resolve(proxy)` does. This reaches
  `call/abortable`: `abortable(() => bindingProxy)()` wraps the Proxy, where it
  passed through. `proxy.then(f).abort()` on a binding Proxy still aborts the
  target.
- `AbortablePromise.of` wraps a value that has `AbortablePromise.prototype` on
  its prototype chain but not the private field that this class's constructor
  sets, as it wraps any value that is no `AbortablePromise`:
  `of(Object.create(AbortablePromise.prototype))` was returned as it was, and
  is now wrapped, and the wrapper rejects with a `TypeError`, as
  `Promise.resolve` does. A prototype swapped with `Object.setPrototypeOf` is
  wrapped, as before; an `AbortablePromise` whose prototype is a Proxy whose
  `getPrototypeOf` trap throws is wrapped too, where `of` threw.
- `of`'s check for a native Promise asks whether `Promise.prototype`, read once
  when the module loads, is on the value's prototype chain (`isPrototypeOf`)
  instead of using `instanceof`, so `Promise[Symbol.hasInstance]` is no longer
  consulted. A value whose chain cannot be walked is not one, and goes where any
  other value goes.
- **Breaking:** the `resolve` and `reject` an executor receives ignore every
  call after the first, as a native promise's do, also while the thenable
  passed to the first is still being followed. A thenable passed to a later
  call is no longer followed. `r(a); r(b)` followed `b` too, so aborting the
  promise aborted both delegates, where it now aborts `a` and leaves `b`
  running. `r(slow); r(Promise.reject(e))` and `r(slow); reject(e)` rejected
  with `e`, and `r(slow); r('fast')` fulfilled with `'fast'`: each follows
  `slow` now, as `Promise` does, and the rejection of the thenable that is no
  longer followed is unhandled, which ends a Node process, where it was handled
  before. The same holds after `reject` or `resolve` with a plain value:
  `reject(e); resolve(Promise.reject(f))` leaves `f` unhandled. The promise
  stays abortable until it settles. This reaches `fakeAbortablePromise()`,
  whose `resolve` and `reject` are an executor's: a test that calls
  `fake.resolve(pending); fake.reject(e)` now follows `pending`, and stays
  pending until `pending` settles, where `reject(e)` rejected it.
  `fakePromise()` is as before.
- **Breaking:** an executor that throws after `resolve(thenable)` no longer
  rejects: it follows the thenable, as with `Promise`, where it rejected with
  the throw. The throw is dropped, and when the thenable never settles the
  promise stays pending with nothing surfaced (after `reject` or
  `resolve(plain)`, a throw never changed the outcome). An executor that
  throws settles the promise like any other rejection, and aborting a settled
  promise has no effect, as the `AbortablePromise` docblock documents. So
  aborting it afterwards no longer aborts the controller passed to the
  constructor, whose signal listener is released when the promise rejects,
  where it stayed until the signal aborted; a `peer` whose executor throws no
  longer aborts the source it shares a controller with; and a listener the
  executor put on its own `context.signal` is no longer called.
- A promise resolved with itself rejects with a `TypeError`, as with `Promise`:
  an executor's `resolve` called with the promise, a thenable it was resolved
  with that calls its callback with the promise, a promise derived by `then`
  whose handler returns it (`p2 = p.then(() => p2)`), and
  `fakeAbortablePromise()`'s `resolve(fake)`. They stayed pending until
  aborted, and an abort after the `TypeError` does nothing. A thenable that
  resolves the promise with a further thenable that resolves with the promise
  is not caught.
- **Breaking:** `AbortablePromise.all`, `allSettled`, `race` and `any` no
  longer throw when `values` is not iterable (`null`, `undefined`, a number, a
  plain object) or its iterator throws: they return a rejected
  `AbortablePromise`, as the `Promise` combinators do, with a `TypeError` or
  what the iterator throws. A `try`/`catch` around the call no longer catches
  it, and a promise nothing awaits or catches is an unhandled rejection, which
  ends a Node process: await it or attach a `catch`. They iterate `values`
  lazily, as `Promise`'s do: a member taken before the iterator throws is
  subscribed to, and the iterator is closed when a subclass's `resolve`
  throws. They took every item first: an earlier member that rejects was left
  unhandled when the iterator threw, and when a subclass's `resolve` threw, a
  generator ran to its end.
- **Breaking:** a member of a combinator that is an `AbortablePromise` whose
  `then` is a function, on the one read `AbortablePromise` makes as it takes
  the member, is handed to `resolve` as a thenable that calls that `then`, so
  a subclass's static `resolve` receives the thenable, where it received the
  member. A member whose `then` is not a function on that read is handed over
  as it is: a getter that returns a function on `Promise`'s own read of it is
  subscribed to and not aborted, where it was aborted.
- Aborting an `AbortablePromise` made with a controller whose `abort()` throws
  (an `AbortController` subclass) rejects it with the `AbortError`, aborts its
  delegate and releases its signal listeners, then throws the controller's
  error, which comes before an error from a later link. Before, the throw ended
  the abort at the controller, which left the promise pending forever, its
  delegate running and its listeners on the signal. A second `abort()` does
  nothing, as before. A controller whose signal has aborted already, because
  it was passed in aborted or another holder aborted it, is no longer asked to
  abort again: a promise made with one rejected with the error its `abort()`
  threw, and one aborted by another holder threw it inside the signal's
  listener, an uncaught exception.
- `abortOn(signal)` on a promise that has already fulfilled or rejected adds no
  listener to `signal`, and neither does reading `context.signal` on such a
  promise; before, each added one. `peer()` on such a promise adds none for the
  settled promise: the peer adds its own listener to the shared signal until it
  settles, where v0.4.0 added two, one of which stayed after the peer settled.
- `PrimitiveValueObject['from']` is now `readonly` in the type, matching the
  frozen factory: assigning to it no longer typechecks.
- Document that `definePrimitiveValueObject<Email>(construct, catchOnly(...))`
  widens `E` to `Error`; pass no type arguments, or all three.
- The release workflow no longer replaces the asset of a release that is already
  public: a rerun succeeds when the published tarball is byte-identical or both
  decompress cleanly to the same contents, and fails otherwise, so a
  truncated or corrupt published tarball fails. Only drafts are replaced and
  then published.
- Pre-release tags (`v1.0.0-rc.1`) are published as pre-releases, and only the
  highest version without a pre-release part is marked Latest; build metadata (`v1.0.0+build.1`) is
  ignored when versions are compared. Release runs for different tags now run
  one at a time, and the release job is stopped after 15 minutes.
- The write-scoped release job no longer restores the pnpm cache.
- The README documents the draft release flow, and its Renovate example now
  uses the `github-releases` datasource.
- Add the `/best-effort` subpath: `BestEffort<T, D>`, a value usable as it
  stands with the diagnostics gathered while it was built, in order, and the
  functions `bestEffort`, `map`, `andThen`, `note`, `gather`, `recover`,
  `recoverWith` and `toResult`, with the type `NotABestEffort`. `map`,
  `andThen`, `note`, `recover`, `recoverWith` and `toResult` are value-last
  and curryable by arity, as `/result`'s combinators are. `toResult` is all or
  nothing: a Success of the value when the list is empty, else a Failure of
  what `toError` makes of the list. `map` refuses a callback that returns a
  `BestEffort`, and `toResult` refuses a `BestEffort`-valued `T`. The root
  entry point gains the namespace `bestEffort`. See
  `docs/adr/0006-best-effort.md`.

## [0.4.0] - 2026-11-14

Upgrading from 0.3.x: there are two breaking changes, both small.
`InternRegistry` now holds only object values, and `definePrimitiveValueObject`
returns a frozen factory.

- **Breaking:** `InternRegistry<K, V>` now requires `V extends object` and holds
  canonical instances weakly, so instances nothing else holds can be collected.
  Behaviour change: `create` can now run more than once for the same key, and
  `get` can return Nothing for a key that was interned earlier, once its
  instance has been collected.
- **Breaking:** `definePrimitiveValueObject` now returns a frozen factory.
  Its properties, including `.from`, can no longer be replaced or extended.
- Add `result/catchOnly(...ErrorClasses)` and a non-empty class-list shorthand
  for `tryCatch`. Listed errors from this realm become failures; every other
  value is rethrown unchanged, including errors from another realm.
- Version tags now run the CI checks and attach a built tarball to their GitHub
  Release. The workflow checks the tag against the package version, and a rerun
  replaces the existing asset.
- The repository now uses pnpm 12.18.0. The README documents tarball installs,
  Git installs and Renovate.
- Document static Factory checks, callable Primitive Value Object factories,
  validation after JSON parsing, and weak Intern Registry retention.
- The README's install line now points at the built tarball attached to the
  GitHub Release, which installs with no build step. The `github:` form
  still builds through `prepare`, and pnpm 11 refuses that without an allow-list.

## [0.3.0] - 2026-08-04

Upgrading from 0.1.x or 0.2.x? See the
[0.1.0 → 0.3.0 migration guide](./docs/migration/0.1.0-to-0.3.0.md).

- Tests pinning the public API surface of every subpath and the root entry
  point, so an accidentally added, removed or renamed export fails CI
  instead of shipping silently. `scripts/assert-exports-resolve.mjs`
  already proved a declared subpath resolves and imports against the
  built package; it said nothing about which symbols came through it.
  Runtime export names are asserted per subpath in `test/api-surface/*.test.ts`
  (`import * as ns` plus a sorted, inline expected list — a snapshot file
  would hide what actually changed); type-only exports, invisible at
  runtime, are pinned separately in a companion `src/**/api-surface.test-d.ts`
  per module that references every documented exported type, so a removal
  or rename fails typecheck instead. The root entry point additionally
  asserts that `/promise/fake` is unreachable from it, the test-double
  isolation the README already documents. The `test/api-surface/*.test.ts`
  files import from `src/` rather than `dist/`, so the suite runs under
  plain vitest with no build; `assert-exports-resolve` remains the check
  for the built-artifact side. To change the surface intentionally: add,
  remove or rename the export in `src/`, then update the matching pin
  (each pinning file's docblock says which one) and the README's module
  table.
- A root entry point (`"."` in `exports`, plus top-level `main`/`types`
  for tooling that ignores `exports`). It re-exports each module as a
  namespace (`maybe`, `result`, `internRegistry`, `valueObject`, ...), so
  the previously-undocumented bare `import from '@lhellemons/ground-types'`
  now resolves instead of failing with an unhelpful module-resolution
  error, without flattening the modules into one namespace — `maybe.map`
  and `result.map` stay distinct. `/promise/fake` is excluded from the
  root, for the same reason it is a separate subpath in the first place.
  Closes #11.
- **Breaking:** `value-object/PrimitiveValueObject` and
  `domain/DomainObjectFactory` gain an `E extends Error = Error` type
  parameter, so a factory can declare the concrete Failure subclass its
  `.from` reports instead of the two being pinned to plain `Error`. This
  was the gap between the library's own pitch — CONTEXT.md's Failure entry
  says "a Failure keeps its concrete Error subclass, so a caller can branch
  on it" — and a factory that could never express which subclass that was.
  `definePrimitiveValueObject` takes a new optional `errorHandler` argument
  to translate a thrown value into that subclass, mirroring `tryCatch`'s own
  handler-shaped overload split: with no `errorHandler`, `.from` routes
  through `tryCatch`'s handler-less overload and `E` is `Error`; with one,
  it routes through the generic overload and `E` follows the handler. Name
  `E` explicitly alongside `T` when passing an `errorHandler`, since
  `Success`'s invariant `E` phantom (docs/adr/0001, 2026-08-04 amendment)
  keeps TypeScript from reliably inferring `E` from `errorHandler`'s return
  type alone — confirmed by trying inference-only first and watching it
  default back to `Error`. `DomainObjectFactory`'s new `E` sits ahead of the
  existing `TExtra` parameter, both defaulted, so a call site naming neither
  is unaffected and one naming only `TExtra` today needs to start naming `E`
  too (or switch to naming both by position).

- **Breaking:** `definePrimitiveValueObject`'s type parameters are now
  ordered `T, P, E`, matching `PrimitiveValueObject<T, P, E>` exactly,
  reversing the `P, T` order it took before. `P` also now defaults to
  `string` at the function itself, not just on the type. `T` — the
  branded type actually being defined — is what a caller wants to name;
  with `T` first and both `P` and `E` defaulted, the common case is one
  explicit type argument, `definePrimitiveValueObject<Email>(...)`. The
  old order left that same single argument compiling silently as `P`
  instead of `T`, leaving `T` as `unknown` — confirmed by trying it,
  not assumed. A call site naming both type arguments today needs them
  swapped: `definePrimitiveValueObject<P, T>(...)` becomes
  `definePrimitiveValueObject<T, P>(...)`.

- **Breaking:** `domain/DomainObjectDTO` renamed to `domain/DTOSource`.
  The old name and shape disagreed with CONTEXT.md's own DTO entry: a DTO
  is "the plain, untrusted data shape a domain object is constructed from
  and serialised to", but `DomainObjectDTO<TDTO> = { readonly dto: TDTO }`
  was a domain object _carrying_ its DTO, not the DTO itself. `DTOSource`
  names what the type actually is — the other direction of a Factory's
  seam, recovering the DTO a domain object's current values would
  round-trip back through the Factory that built it — and CONTEXT.md
  gains a matching "DTO Source" entry next to Factory. Same shape, same
  signature; only the name changed. A consumer referencing
  `DomainObjectDTO` needs to rename the import and any `implements`/
  `satisfies` clause to `DTOSource`.

- **Breaking:** `result/map`, `result/andThen` and `result/tryCatch` now
  reject a callback whose return type has a thenable arm — a `Promise`, a
  non-native thenable, or a sync/async union such as
  `(n) => number | Promise<number>` — at compile time. Nothing in `/result`
  asserted that a value resolves synchronously: `tryCatch(async () => { throw
... })` returned a value `isSuccess` reported as `true`, which then rejected
  unhandled (#6), and `andThen`/`map` given an `async` callback silently
  inferred a `Success` whose value is itself an unresolved `Promise` (#15).
  Both were symptoms of one gap, not two bugs. Detection goes by shape
  (`HasThenableArm`, distributing over the callback's return type) rather than
  exact `Promise` type equality, and by structural `then` duck-typing rather
  than `instanceof` — the same rule `await` itself uses — so it also catches a
  custom deferred and a callback that only sometimes returns a `Promise`.
  `fallback` needed no matching guard: its callback's return type is pinned to
  `Success<T, E>` rather than inferred from a free type parameter, so a
  thenable already fails ordinary structural assignability there.

  No new async combinators were added. `promise/resultify` and
  `call/resultify` are already the sanctioned lift from a rejecting
  `Promise`/`Call` to a `Promise<Result<T, E>>`, and every `/result`
  combinator is a plain unary function, so it already composes with `.then()`.
  This is not the `all`/`sequence` fan-in ADR-0001 refuses: a lift to
  `Promise<Result<T, E>>` wraps the same unboxed `Result` in a container the
  platform already provides, resolved before anything inspects it — it does
  not erode the "a `Success` can never be an `Error`" guarantee.

- **Breaking:** `maybe/map` (and `andThen`, its true alias) now rejects a
  callback whose return type has a thenable arm, exactly as `result/map`
  already did. `map(async (n) => ...)` compiled and produced
  `Maybe<Promise<string>>` — a `Just` that is an unresolved `Promise`,
  present whatever it eventually settles to — because nothing in `/maybe`
  asserted that a value resolves synchronously. The guard is `/result`'s
  own `NotAPromise`, now exported and imported type-only so the
  maybe/result boundary stays free of a runtime cycle, and it surfaces
  the identical diagnostic naming the sanctioned fix: resolve with
  `promise/resultify` or `call/resultify` first, then compose with
  `.then()`.
- `maybe/fromNullable` — the boundary helper for null-convention APIs,
  folding both `null` and `undefined` to `Nothing`. The encoding knows
  exactly one absence — `Nothing` _is_ `undefined` — so to `maybe()` a
  `null` is a value and becomes a `Just`: a trap for the stated boundary
  use-case, since half the platform signals absence with `null`
  (`querySelector`, `RegExp.prototype.exec`, a JSON field). The `null` is
  folded away rather than carried — the return type is
  `Maybe<NonNullable<T>>` — so downstream code never sees a null again
  and the one-absence encoding stays clean. `maybe()` itself is
  unchanged: only `undefined` is Nothing to it.
- **Breaking:** `result/tryCatch` is split into two overloads so its
  default handler is sound. `tryCatch(fn)` fixes `E = Error` — exactly
  what the default handler can honour: the `Error` as thrown, or a
  `ThrownError` around anything else — while `tryCatch(fn, handler)`
  stays generic in `E`, where the handler is the caller's own promise to
  produce that `E`. Under the single signature, `E` could be named
  explicitly with the handler omitted, and the default's documented
  unsound cast then passed a thrown `TypeError` off as
  `Failure<T, MyError>`. That spelling — three type arguments, one value
  argument — no longer matches any overload; supply the handler that
  produces the named error, or drop the type arguments.
- `maybe/Just` and `maybe/Nothing` default their type parameter to
  `unknown`, so the case names can be written bare in an annotation. A
  bare `Nothing` is exactly `undefined`; a bare `Just` is plain `unknown`
  — "present, type unstated" as a reading for humans, since the default
  cannot exclude `undefined` without knowing `T`. `Maybe` deliberately
  keeps its required argument: a bare `Maybe` would evaluate to plain
  `unknown`, an annotation claiming "may be absent" that the checker
  holds you to nothing on.
- **Breaking:** `result/failure`'s type parameters are reordered from
  `<T, E extends Error>` to `<E extends Error, T = unknown>`. The single
  explicit type argument a caller plausibly writes — `failure<MyError>(e)`
  — used to bind the _success_ type, silently yielding
  `Failure<MyError, Error>`: the named error class demoted to plain
  `Error`, with no diagnostic. It now binds the error, and a non-`Error`
  first argument is a compile error rather than a quiet mis-bind. Call
  sites that named both parameters swap them
  (`failure<number, E>` → `failure<E, number>`); call sites with no type
  arguments are unaffected. `success<T, E>` keeps its value-first order —
  the asymmetry is deliberate and documented on both constructors: each
  puts the type its caller actually has in hand first.
- `result/mapError` — `map`'s dual over the failure channel: applies a
  callback to a `Failure`'s `Error` and passes a `Success` through, so a
  factory's error can be translated into the caller's domain error
  _inside_ a chain. Previously the failure channel could only be erased —
  `orElse` and `fallback` both end in a `Success` — while `tryCatch` and
  `resultify`'s handlers could re-fail; the two vocabularies were
  inconsistent. The callback shares those handlers' shape: it returns a
  whole `Result`, so a bare `Error` is pure translation and a `Success`
  recovers, with the inferred error type tracking exactly which arms the
  callback actually has. Curryable like the rest, and guarded by
  `NotAPromise`. `/maybe` deliberately has no counterpart: `Nothing`
  carries nothing to transform.
- Every config-taking combinator in `maybe` (`map`, `andThen`, `orElse`,
  `fallback`) and `result` (`map`, `andThen`, `orElse`, `fallback`,
  `fromMaybe`) is now curryable: `map(fn)` still returns a unary Mapper,
  and `map(fn, value)` applies it immediately. This closes the split
  calling convention ADR-0003 recorded — `promise/resultify(fail,
promise)` was curryable while `result/map(fn)` was not — so the whole
  library now reads one way. Which shape a call is in is decided by
  arity, never by inspecting the value: `Nothing` _is_ `undefined`, so
  `map(fn, nothing())` applies rather than handing back the Mapper.
  Existing call sites are unaffected; the unapplied forms of `result/map`
  and `result/andThen` still return generic functions whose `T`/`E` bind
  at application, pinned by type-level tests. See
  [docs/adr/0003-currying.md](./docs/adr/0003-currying.md).

- Docs: an editorial pass over the README and every docblock, harmonizing
  them after the API-coherence batch above. Docblocks now document nature,
  usage and relationships only: motivation and design-rationale prose —
  why an encoding is sound, why a name or parameter order was chosen, why
  an alternative was rejected — is pruned along with history and
  experiment narration ("under the previous order…", "confirmed by trying
  it"); the ADRs and this CHANGELOG keep that record, and a docblock may
  point at an ADR for the why but no longer contains it. Caller-facing
  hazards stay (unhandled-rejection traps, `isAbortError` over
  `instanceof`, synchronous-only callbacks). Drift is also fixed: the
  README module table was missing `intern-registry/internByKey` and
  `promise/TrackedState`, and its Status section credited the unreleased
  `result/mapError` to v0.2.x. No signature, type, or behaviour changes.

An asynchrony layer, ported from another project and reworked to fit this
library. No release cut; see
[docs/adr/0002-abort-propagation.md](./docs/adr/0002-abort-propagation.md)
and [docs/adr/0003-currying.md](./docs/adr/0003-currying.md).

### Added

- `promise` — `AbortablePromise`, a `Promise` subclass that can be
  aborted before it settles; `State`, the four-case machine for where an
  asynchronous operation is; `RejectionError`; and `resultify`, `fail`
  and `recoverWith` for turning a rejecting promise into one that always
  resolves with a `Result`.
- `promise/fake` — `fakePromise` and `fakeAbortablePromise`, manually
  settleable promises for testing. A separate subpath, so test doubles
  cannot reach a production bundle by accident.
- `call` — `Call`, `AsyncCall` and `AbortableCall`, plus `abortable` and
  `resultify` for lifting a Call into an abortable or Result-returning
  one.
- `abort` — `AbortError`, `isAbortError` and `ABORT_ERROR_NAME`. Because
  `DOMException` inherits from `Error`, an `AbortError` is already a
  valid `Failure`.
- `AbortablePromise.detach` — severs the upstream abort link, so a branch
  can be cancelled without cancelling the source it shares.
- `fn` gains `Mapper`, `CurryableMapper`, `curry`, `identity`, `constant`
  and `pipe` — `pipe(value, ...steps)` runs `value` through up to ten
  `Mapper` steps left to right, applied immediately.
- `State` gains constructors, guards, `settledResult` — the bridge to the
  primitives, `Nothing` while the operation is unfinished and a `Result`
  once it settles — and `stateOf`, a live view of a promise's State.
- `result/ThrownError` — the Error a thrown value is wrapped in when it
  was not already one, so a `Failure` always carries an `Error`. The
  synchronous case of `promise/RejectionError`, which now extends it
  rather than keeping a second copy of the same defensive rendering.
- `pnpm assert:exports`, run in CI, checks that every subpath in
  `package.json`'s `exports` resolves and imports, and that every built
  module is reachable through one. `pnpm install` already builds through
  `prepare`, so a broken emit fails the job; nothing checked that the
  entry points the package advertises matched what came out of the build,
  which is what four new subpaths made worth checking.

A second pass then reviewed how the ported modules sit against the
existing primitives, and closed the gaps it found.

### Changed

- **`resultify` returns a plain `Promise`, never an `AbortablePromise`.**
  Previously an abort meant two different things depending on which
  handle you held: aborting the source resolved with a `Failure`, while
  aborting the lifted promise rejected with an `AbortError`. There is now
  one abortable handle, so abort has one outcome. A lifted `Call` is
  correspondingly not cancellable; hold the promise and lift where you
  consume it.
- **`all`, `race`, `any` and `allSettled` abort their members.**
  Inherited from `Promise`, they returned something whose `abort()` ran
  and left every member going. Plain-`Promise` members are skipped, and
  the losers of a `race` are not aborted.
- **The executor's third argument is an `AbortContext`, not an
  `AbortSignal`.** `context.signal` is a lazy getter, so the
  `AbortController` and its `EventTarget` are allocated only when
  something actually reads it — a `resolve().then().then()` chain now
  allocates none, where it previously allocated four.
- `result/tryCatch`'s `errorHandler` returns a `Result` rather than an
  `Error`, matching `resultify`'s rejection mapper, so one handler
  vocabulary covers both and a handler may now recover. Backward
  compatible: every `E` is already a `Result<T, E>`.
- `call/resultify` takes its type parameters as `<O, E, I>`, so the two
  it shares with `promise/resultify<O, E>` keep their positions.
- `promise/recoverWith` delegates to `fn/constant` instead of
  reimplementing it.
- `tsconfig` `lib` now includes `DOM`, for `AbortController`,
  `AbortSignal` and `DOMException`. These reach the emitted declarations,
  so consumers need `DOM` or `@types/node` in their own `lib`.
- `curry` decides whether it was given an input by arity rather than by
  testing for `undefined`. The old test was unsafe here, where `Nothing`
  _is_ `undefined`.
- `fail` is generic in the success type it never produces, so
  `resultify(fail, promise)` no longer infers `Result<Error, Error>`.
- `AbortablePromise` rejects with a fresh `AbortError` per abort rather
  than one shared instance, so each carries the stack of the abort that
  happened. Recognise them with `isAbortError`, not by identity.
- `AbortablePromise.resolve` follows the standard `Promise.resolve`
  overloads; it previously widened the element type with `undefined`.
- **Breaking: `pipe` reversed to value-first, N-ary, always immediate**, the same
  day it was ported in as function-first, 2-ary and curryable. The
  curryable shape couldn't chain more than two steps without nesting —
  the exact problem it was meant to solve (#7) — and its deferred form
  (`pipe(f1, f2)`, no value) cannot infer a bare unannotated step: there
  is nothing in that call for TypeScript to anchor on, measured by
  emitting declarations rather than assumed. `pipe(x, f1, ..., f10)` now
  pins every step's parameter type to the previous step's return type,
  and was run through a 7-step chain mixing `maybe` and `result`,
  bridged mid-chain, without inference degrading. See
  [docs/adr/0004-pipe-value-first.md](./docs/adr/0004-pipe-value-first.md).
- `compose` extended from a fixed 2-ary to up to ten Mappers, right to
  left, mirroring `pipe`'s per-arity overload set: every step's parameter
  type is pinned to its neighbour's return type, and an eleventh Mapper is
  a compile error rather than a silent `unknown`. `pipe`'s redesign closed
  #7 for the value-in-hand case; `compose` was still capped at two, which
  recreated the same nesting problem for the deferred, no-value-yet case
  the README already told readers to reach for it for. Non-breaking: every
  existing 2-ary call typechecks and behaves exactly as before.
- `curry` and `CurryableMapper` stay public, with their docblocks rewritten
  to present them as the extension point for a consumer writing their own
  curryable combinator, rather than reading as an implementation detail
  that happens to be exported. `CurryableMapper`'s docblock already said
  its union "is not meant to be narrowed at a call site", and `curry`'s
  said callers must forward arity via a `[] | [T]` rest tuple or the
  mechanism silently breaks — true, but written for a reader who already
  knew what these two were for. Both docblocks now show the same
  three-part shape `promise/resultify` and `call/resultify` already use
  (two overloads, a rest-tuple implementation signature, a body that
  spreads into `curry`), with a worked `scaleBy` example pinned as a
  runtime test in `src/fn/index.test.ts`. No behaviour or signature
  change.

A review pass then found four places where the layer did not hold its own
contracts, and closed them.

### Fixed

- **`resultify` no longer rejects when the rejection reason cannot be
  rendered.** `RejectionError` built its message by interpolating the
  reason, which throws for a symbol, an object with a null prototype, or
  anything whose `toString` throws — so `fail` threw and the throw escaped
  as a rejection, in exactly the case `RejectionError` exists to serve.
  The message is now built defensively; `reason` is untouched either way.
- **Resolving with a promise no longer closes the abort window.**
  `new AbortablePromise((resolve) => resolve(work()))` counted as settled
  the moment `resolve` was called, so `abort()` silently did nothing for
  the delegating shape the class exists for. A resolution handed a
  thenable is now adopted and settles with it; a resolution handed a plain
  value settles at once, as before.
- **Aborting a promise aborts the `AbortablePromise` it delegated to.**
  Keeping the abort window open said when the abort was still allowed, not
  where it went: the outer promise rejected while `work()` ran on,
  uncancelled and unobserved. Delegation is upstream, so abort now travels
  it as it travels `then`. A plain-`Promise` delegate is left alone, since
  there is nothing on it to abort, and `resolve(work().detach())` hands
  over the outcome without handing over the right to cancel.
- **`AbortablePromise.all` and `allSettled` keep `Promise`'s tuple
  overloads**, along with `race` and `any`. Overriding with only the
  iterable signature made `AbortablePromise.all([promiseOfA, promiseOfB])`
  a type error rather than a tuple, and degraded a same-type call from
  `[number, number]` to `number[]`.
- **A `Call` that throws synchronously is reported as a rejection.** A
  Call may settle synchronously, so it may fail that way; the throw
  escaped both `call/resultify`, which promises never to reject, and
  `call/abortable`, which is typed as returning an `AbortablePromise`.
  Both now route it through the same path as an asynchronous failure.
- `RejectionError`'s type parameter defaults to `unknown`, so the bare
  name is usable in a type annotation.
- `AbortState` drops its upstream links when the promise settles, rather
  than only when it is aborted, so a retained tail no longer keeps its
  whole chain reachable.
- `call/resultify`'s overloads are ordered applied-form-first, matching
  `promise/resultify`, and it no longer hand-rolls a `Promise` normaliser.
- An abort is a rejection, so aborting a promise nothing is consuming
  ends a Node process. The shapes the design is built around are safe —
  a chain handles its own head, the fan-in combinators handle their
  members, and `detach` leaves its source alone, all three now pinned by
  tests — but `AbortablePromise.abort()`, `abortOn` and `peer` can each
  reach an unconsumed promise, and now say so.
- Docblocks: `call/abortable` (a stub) and `promise/fake` are brought to
  the standard of the rest of the library, `settledResult` documents that
  it cannot distinguish a fulfilled `void` from an unfinished operation,
  `isAbortError` documents why narrowing to `AbortError` is sound for a
  platform `DOMException`, and `Call` documents why its output is named
  before its input.
- **`call/resultify` is typed as returning an `AsyncCall`**, not a
  `Call`. It builds a promise whatever it was handed, including for a
  Call that settles synchronously, so `Call`'s `O | Promise<O>` declared
  a union whose left branch cannot occur and left every caller to
  collapse it. `AbortableCall` is now defined as the abortable case of
  the same idea.
- **`pnpm build` clears `dist` first**, so `pnpm assert:exports` cannot
  report a module that no longer exists. `tsc` only ever adds to its
  outDir, so a renamed or dropped module left its old directory behind,
  and the check that every built module is exported then failed on it —
  on the one machine that did the rename, and never in CI, which always
  starts from an empty checkout.
- **A signal binding is released when the promise settles**, so binding
  many short-lived promises to one long-lived signal no longer
  accumulates a listener per promise, each pinning its closure and its
  abort state until the signal aborts — which for an application-lifetime
  signal means never. Covers both `abortOn` and a controller handed to
  the constructor, whose identical retention was undocumented. Nothing
  observes the settlement to do this; the release happens inside the
  bookkeeping that decides it, so the promise's handled-ness is
  untouched. ADR-0002's ruling that this could not be done is superseded
  there.
- **`tryCatch`'s default handler no longer lets a non-`Error` throw pass
  as a `Success`.** `throw` accepts any value and a `Result` is
  discriminated by `instanceof Error`, so a thrown string was returned
  unchanged and read as a `Success` — the failure vanishing into the very
  channel the lift exists to keep it out of. A thrown `Error` still passes
  through with its concrete subclass intact; anything else is wrapped in
  the new `result/ThrownError`, which is what `promise/fail` has always
  done with a rejection. The two lifts now agree in their defaults, not
  only in their handler shape.
- One imported test could never fail. `AbortablePromise.peer`'s
  "aborts the original one when aborted" wrapped its body in a `try` that
  logged and swallowed, so every assertion in it threw into the `catch`
  and the test passed whatever the class did. The `try` is gone.

A further pass then fixed the Result combinators' type inference, which
had been collapsing silently.

### Fixed

- **Breaking:** `result/andThen` no longer collapses its `Success` type to
  `unknown`. Chaining a callback that can itself fail — the ordinary case —
  inferred `Result<unknown, Error>`, because `Result<U, E>` was used as an
  inference site and TypeScript cannot infer `U` out of a union whose arms
  hide it behind a conditional (`Success`) and an intersection (`Failure`).
  The callback's return type is now captured whole and decomposed
  afterwards. The existing tests missed this: every one of them used a
  callback with a single return path, which infers correctly.
- **Breaking:** `result/andThen`'s error type now widens to the union of the
  input's error and the callback's, `Result<U, E | F>`, rather than forcing
  both to a single `E`. The curried function is generic, so `E` is inferred
  when the `Result` is applied instead of defaulting to `Error`.
- **Breaking:** `result/map` now rejects a `Result`-returning callback at
  compile time, naming `andThen` as the fix. This was already documented as
  a trap; in practice it inferred `any` and silently erased all downstream
  type checking.
- **Breaking:** `result/map` and `result/andThen` now take two type
  parameters rather than three. Call sites that passed type arguments
  explicitly — `map<number, string, MyError>(fn)` — no longer compile.
  Inferred call sites, which is nearly all of them, are unaffected.
- `result/andThen` keeps the `Failure` arm of a callback that returns a raw
  `Error` subclass instead of routing it through `failure()`. The two are
  the same value at runtime — both are identity casts, and discrimination
  is `instanceof Error` — but the error type was dropped from the union
  entirely, so a caller exhausting over the error type was wrong at
  runtime. Found in review of this change.
- `result/map`'s rejection of a callback returning an `Error` subclass as a
  plain value now says so — `'A Success can never be an Error — see
docs/adr/0001-unboxed-maybe-and-result.md'` — instead of misdirecting to
  `andThen`, which cannot fix it: `Success<T, E>` collapses to `never` for
  `T extends Error`, so there is no way to carry that value through this
  encoding. The callback-returns-a-`Result` message is unchanged for the
  case it actually describes. `NotAResult` is now exported so both messages
  can be pinned by type-level tests. (#16)

### Changed

- `Success` and `Failure` carry two additional compile-time-only phantom
  markers (`_value`, `_error`) giving the combinators a plain position to
  infer from. The unboxed encoding is unchanged, and both invariants
  ADR-0001 rests on still hold: `Result<Result<T>>` remains distinct from
  `Result<T>`, and a `Success` can never be an `Error`. Of the two
  original phantoms, only `Failure`'s `T` marker is what keeps
  `Result<Result<T>>` distinct from `Result<T>` — dropping it collapses
  the two, measured by emitting declarations. `Success`'s `E` marker is
  not load-bearing for that invariant; it is what makes `Success`
  invariant in `E`, tracked separately as issue #17.

### Added

- Type-level tests now run as real tests via Vitest's `typecheck` mode
  (`src/**/*.test-d.ts`), so a broken inference fails the suite instead of
  surfacing as a bare `tsc` error.
- ESLint with type-aware `typescript-eslint` rules, wired into `pnpm check`
  and CI (#12): `no-floating-promises`, `no-misused-promises`,
  `no-unnecessary-type-assertion`, `no-unnecessary-condition`,
  `no-explicit-any` and the `no-unsafe-*` family. `no-unnecessary-type-assertion`
  found four genuinely redundant casts in `result/index.ts` (`failure`,
  `tryCatch`'s catch branch, and an inner cast each in `map` and `andThen`),
  now removed. The handful of casts that remain in that file route around a
  TypeScript limit the compiler can't reduce — a deferred conditional type —
  confirmed load-bearing by re-running the type suite with each removed one
  at a time; the two remaining false-positive spots (`maybe/isJust`,
  `maybe/isNothing`, `result/fromMaybe`) carry a narrow, commented
  `eslint-disable-next-line` rather than a blanket file-level exemption.

  Run against the async layer, the same rules turned up an unused `Failure`
  import in `promise/resultify`, two redundant casts, and an `any` leaking
  out of `AbortablePromise`'s constructor — `value instanceof
AbortablePromise` narrows to `AbortablePromise<any>`, which then infected
  the type of the value it adopts. All four are fixed rather than silenced.
  Tests turn off exactly three rules (`prefer-promise-reject-errors`,
  `only-throw-error`, `require-await`): `/promise`, `/call` and `/result`
  exist to normalise an arbitrary thrown or rejected value into a `Failure`
  carrying an `Error`, so rejecting a bare string is the input under test.
  `AbortablePromise.then` and `.catch` keep `reason: any` — copied from
  lib.es5, where `unknown` would make the override reject the ordinary
  `.catch((e: Error) => …)` its base class accepts.

- Coverage via `@vitest/coverage-v8`, with a 90% threshold across lines,
  statements, branches and functions, wired into `pnpm check` and CI (#12).
  Coverage would not have caught the `result/andThen` and `result/map`
  inference bugs above — those lines were fully covered; the existing tests
  just used callbacks with a single return path, which infers correctly
  regardless. Coverage catches untested branches, not untested types; ESLint
  is what catches the latter. Currently 98.95%; the shortfall is
  `call/index.ts`, a barrel no test imports directly, and the untested
  `reason` getter on `promise/RejectionError`.

### Changed

- **Breaking:** `fn/Function` renamed to `fn/Fn`. The old name shadowed
  the global `Function` at every import site. Same signature, same
  behaviour. (#8)
- **Breaking:** `brand/Brand`'s key is now a module-private unique
  symbol instead of the plain string property `__brand`. A hand-rolled
  `as string & { __brand: '...' }` cast no longer produces a value
  assignable to a `Branded` type, and the brand key no longer appears in
  `keyof` on a branded value. Legitimate construction (`value as T`
  inside a validating constructor) is unaffected. (#9)

### Fixed

- README install line pinned a stale `^0.1.0`; now matches the current
  `0.2.0` release (#13).
- ADR-0001 claimed the maybe/result no-runtime-cycle invariant was
  "checked, not assumed" and "verified after every build" — nothing runs
  that check. Reworded to describe the invariant as convention-maintained
  and documented in the bridge functions' inline comments, not automated
  (#14).

## [0.2.0] - 2026-08-03

### Added

- `maybe/assertJust` — mirrors `result/assertSuccess`; throws when the
  value is Nothing.
- `maybe/fallback` — lazy counterpart to the existing eager
  `maybe/orElse`.
- `maybe/fromResult` — bridges `Result` to `Maybe`, discarding the error.
- `result/orElse` — eager counterpart to the existing lazy
  `result/fallback`.
- `result/fromMaybe` — bridges `Maybe` to `Result`, given an error to use
  for the Nothing case.
- Docblocks on every export across all seven modules.
- Test coverage for all seven modules, including type-level assertions.
- [docs/adr/0001-unboxed-maybe-and-result.md](./docs/adr/0001-unboxed-maybe-and-result.md),
  recording the rationale for the unboxed encoding and this release's
  symmetry rulings.

### Changed

- **Breaking:** `maybe/flatMap` renamed to `maybe/andThen`, for symmetry
  with `result/andThen`. Same signature, same behaviour.

### Removed

- **Breaking:** `maybe/flatten`. Provably an identity function —
  `Maybe<Maybe<T>>` and `Maybe<T>` are mutually assignable, so nothing
  ever nested and nothing was ever flattened.

## [0.1.0] - 2026-08-03

Initial extraction from Slider's `src/util`.

### Added

- `maybe` — `Maybe`/`Just`/`Nothing` over an unboxed `T | undefined`.
- `result` — `Result`/`Success`/`Failure` over an unboxed
  value-or-`Error` encoding.
- `brand` — `Brand`/`Branded` phantom-typing helpers.
- `value-object` — `definePrimitiveValueObject` for Primitive Value
  Objects.
- `domain` — `Entity`, `CompoundValueObject`, `DomainObjectDTO`,
  `DomainObjectFactory`.
- `intern-registry` — `InternRegistry` for canonicalising Value Objects.
- `fn` — `compose` and the `Function` type.
