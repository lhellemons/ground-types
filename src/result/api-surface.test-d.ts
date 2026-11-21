import { catchOnly, isSuccess, success, tryCatch } from './index.js'
import { resultify } from '../promise/index.js'
import { resultify as callResultify } from '../call/index.js'
import { definePrimitiveValueObject } from '../value-object/index.js'
import type { Branded } from '../brand/index.js'
import { describe, expectTypeOf, it } from 'vitest'
import type {
  Collected,
  Failed,
  Failure,
  FailureMarkers,
  NotAGenerator,
  NotAPromise,
  NotAResult,
  NotPossiblyAnError,
  Parts,
  Result,
  Success,
  SuccessArm,
  SuccessMarkers,
  Take,
} from './index.js'

/**
 * Pins `/result`'s type-only exports — invisible at runtime, so untouched by
 * `test/api-surface/result.test.ts`. Referencing each by name means a
 * removal or rename fails typecheck instead of silently dropping from the
 * public surface. See that file's docblock for the full rationale.
 *
 * `Success` and `Failure` carry a module-private phantom brand (see
 * `src/result/index.ts`), so their exact shape cannot be reconstructed from
 * outside the module for a `toEqualTypeOf` comparison — asserting
 * assignability instead is enough to pin that the names still exist and
 * still mean what they always have: a `Success<T>` is usable as a `T`, and
 * a `Failure` is usable as an `Error`.
 */
declare const s: Success<number, RangeError>
declare const f: Failure<number, RangeError>
declare const r: Result<number, RangeError>

describe('/result type exports', () => {
  it('Success<T> is usable as T — the unboxed encoding', () => {
    expectTypeOf(s).toExtend<number>()
  })

  it('SuccessArm is the marked part of a Success, and a Success is it or a nullish value', () => {
    expectTypeOf<SuccessArm<number, RangeError>>().toExtend<typeof s>()
    expectTypeOf<Success<string | undefined, RangeError>>().toEqualTypeOf<
      SuccessArm<string | undefined, RangeError> | undefined
    >()
    // `toEqualTypeOf` cannot tell the alias argument `string | undefined`
    // from `string`; a generic reads it.
    const plain = <T, E extends Error = Error>(value: Result<T, E>): [T, E] => [
      value as T,
      undefined as unknown as E,
    ]
    const optional = null as unknown as Success<string | undefined, RangeError>
    expectTypeOf(plain(optional)).toEqualTypeOf<
      [string | undefined, RangeError]
    >()
  })

  it('SuccessMarkers and FailureMarkers are the markers of a SuccessArm and a Failure', () => {
    expectTypeOf<SuccessArm<number, RangeError>>().toExtend<
      SuccessMarkers<number, RangeError>
    >()
    expectTypeOf<Failure<number, RangeError>>().toExtend<
      FailureMarkers<number, RangeError>
    >()
    expectTypeOf<SuccessArm<number, RangeError>>().not.toExtend<
      FailureMarkers<number, RangeError>
    >()
  })

  it('no Failure fits SuccessMarkers: the _error marker refuses it', () => {
    // `Failure<never, Error>`'s `_phantom` is `never`, which fits any
    // `SuccessMarkers` `_phantom`; only `[_error]?: never` refuses it.
    expectTypeOf<Failure<never, Error>>().not.toExtend<
      SuccessMarkers<unknown, RangeError>
    >()
  })

  it('a Success of an object literal type fits an index signature; a Failure does not', () => {
    expectTypeOf<SuccessArm<{ id: string }, Error>>().toExtend<
      Record<string, unknown>
    >()
    expectTypeOf<Failure<number, Error>>().not.toExtend<
      Record<string, unknown>
    >()
    const log = (_meta: Record<string, unknown>): void => undefined
    log(success({ id: 'x', name: 'n' }))
    const record = null as unknown as Result<{ id: string }, Error>
    if (isSuccess(record)) log(record)
    void new URLSearchParams(success({ a: '1' }))
    const checked = success({ a: 1 }) satisfies Record<string, unknown>
    void checked
  })

  it('a Success of an interface type does not fit an index signature', () => {
    interface User {
      id: string
    }
    expectTypeOf<SuccessArm<User, Error>>().not.toExtend<
      Record<string, unknown>
    >()
  })

  it('Failure is usable as an Error — the unboxed encoding', () => {
    expectTypeOf(f).toExtend<Error>()
  })

  it('Result<T, E> is the union of Success<T, E> and Failure<T, E>', () => {
    expectTypeOf(r).toEqualTypeOf<typeof s | typeof f>()
  })

  it('NotAResult names andThen for a callback returning a Result', () => {
    expectTypeOf<
      NotAResult<Result<number, Error>>
    >().toEqualTypeOf<'This callback returns a Result — use andThen, not map'>()
  })

  it('NotPossiblyAnError names result() for a value that may be an Error', () => {
    expectTypeOf<
      NotPossiblyAnError<unknown>
    >().toEqualTypeOf<'This value may be an Error — wrap it with result(), not success()'>()
    expectTypeOf<NotPossiblyAnError<number>>().toEqualTypeOf<unknown>()
  })

  it('NotPossiblyAnError carries the same message from each of its three branches', () => {
    type Message =
      'This value may be an Error — wrap it with result(), not success()'
    // an `Error` member
    expectTypeOf<NotPossiblyAnError<number | Error>>().toEqualTypeOf<Message>()
    // the empty object fits
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- `{}` is the case under test
    expectTypeOf<NotPossiblyAnError<{}>>().toEqualTypeOf<Message>()
    // a plain Error fits
    expectTypeOf<
      NotPossiblyAnError<{ message: string }>
    >().toEqualTypeOf<Message>()
  })

  it('NotAPromise names the sanctioned lift for a callback returning a Promise', () => {
    expectTypeOf<
      NotAPromise<Promise<number>>
    >().toEqualTypeOf<'This callback returns a Promise (or thenable) — resolve it first with promise/resultify or call/resultify, then compose with .then()'>()
  })
})

class FailA extends Error {
  readonly kind = 'FailA' as const
}
class FailB extends Error {
  readonly kind = 'FailB' as const
}
declare const take: Take<FailA>
declare const successA: Success<number, FailA>
declare const resultB: Result<number, FailB>
describe('fan-in type exports', () => {
  it('Parts is what collect accepts: an object of parts, a tuple or a list', () => {
    expectTypeOf<{ a: number }>().toExtend<Parts>()
    expectTypeOf<readonly [number, string]>().toExtend<Parts>()
    expectTypeOf<Result<number, RangeError>[]>().toExtend<Parts>()
    expectTypeOf<number>().not.toExtend<Parts>()
  })

  it('Collected unboxes each member of the parts, readonly', () => {
    expectTypeOf<
      Collected<{ a: Result<number, RangeError>; b: string }>
    >().toEqualTypeOf<{ readonly a: number; readonly b: string }>()
    expectTypeOf<
      Collected<readonly [Result<number, RangeError>, string]>
    >().toEqualTypeOf<readonly [number, string]>()
  })

  it('Failed is the union of the members error types, and never for parts that cannot fail', () => {
    expectTypeOf<
      Failed<{ a: Result<number, FailA>; b: Result<string, FailB> }>
    >().toEqualTypeOf<FailA | FailB>()
    expectTypeOf<Failed<{ a: number }>>().toEqualTypeOf<never>()
  })

  it('NotAGenerator names the fix for a body that returns a generator', () => {
    expectTypeOf<
      NotAGenerator<Generator<number, void, undefined>>
    >().toEqualTypeOf<'This body returns a generator — attempt runs its body to completion, so write a plain function'>()
    expectTypeOf<NotAGenerator<number[]>>().toEqualTypeOf<unknown>()
  })

  it('Take unboxes a part whose error fits E', () => {
    expectTypeOf(take(successA)).toEqualTypeOf<number>()
    // @ts-expect-error - FailB is outside FailA
    take(resultB)
  })
})

class Selected extends Error {
  readonly selected = true
}
class Other extends Error {
  readonly other = true
}
class Private extends Error {
  private constructor() {
    super('private')
  }
  static create(): Private {
    return new Private()
  }
}
declare const Ctor: new (message: string) => Selected
declare const AbsCtor: abstract new () => Other
// `Function` is the type under test.
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
declare const anyFunction: Function
declare const StringCtor: new () => string
declare const ObjectCtor: new () => { x: number }
declare const NumberAbsCtor: abstract new () => number
declare const construct: (value: string) => Branded<string, 'Selected'>
describe('selective handler inference', () => {
  it('infers the selected union at each site', () => {
    const handler = catchOnly(Selected, Other)
    expectTypeOf(tryCatch(() => 1, handler)()).toEqualTypeOf<
      Result<number, Selected | Other>
    >()
    expectTypeOf(resultify(handler, Promise.resolve(1))).toEqualTypeOf<
      Promise<Result<number, Selected | Other>>
    >()
    expectTypeOf(callResultify(handler, () => 1)()).toEqualTypeOf<
      Promise<Result<number, Selected | Other>>
    >()
    expectTypeOf(
      definePrimitiveValueObject(construct, handler).from('x'),
    ).toEqualTypeOf<Result<Branded<string, 'Selected'>, Selected | Other>>()

    expectTypeOf(tryCatch(() => 1, [Selected, Other])()).toEqualTypeOf<
      Result<number, Selected | Other>
    >()
    expectTypeOf(tryCatch(() => 1, [Selected])()).toEqualTypeOf<
      Result<number, Selected>
    >()
    // Error classes with a private constructor and a static factory
    expectTypeOf(tryCatch(() => 1, [Private])()).toEqualTypeOf<
      Result<number, Private>
    >()
    expectTypeOf(
      tryCatch(() => 1, catchOnly(Private, Selected))(),
    ).toEqualTypeOf<Result<number, Private | Selected>>()
    expectTypeOf(tryCatch(() => 1, [Private, Selected])()).toEqualTypeOf<
      Result<number, Private | Selected>
    >()
    // Constructor-typed values keep their instance type, never `any`
    expectTypeOf(tryCatch(() => 1, [Ctor])()).toEqualTypeOf<
      Result<number, Selected>
    >()
    expectTypeOf(tryCatch(() => 1, [Ctor, AbsCtor, Private])()).toEqualTypeOf<
      Result<number, Selected | Other | Private>
    >()
    expectTypeOf(tryCatch(() => 1, [Error])()).toEqualTypeOf<
      Result<number, Error>
    >()
    expectTypeOf(catchOnly(Ctor, AbsCtor, Private)).returns.toEqualTypeOf<
      Failure<never, Selected | Other | Private>
    >()
    // @ts-expect-error An arrow function is not an error class
    catchOnly(() => new Selected())
    // @ts-expect-error An arrow function is not an error class
    tryCatch(() => 1, [() => new Selected()])
    // @ts-expect-error A mixed list is rejected
    tryCatch(() => 1, [Selected, () => 1])
    // @ts-expect-error `Function`-typed values are not error classes
    catchOnly(anyFunction)
    // @ts-expect-error A constructor of a non-Error instance is rejected
    catchOnly(StringCtor)
    // @ts-expect-error A constructor of a non-Error instance is rejected
    tryCatch(() => 1, [StringCtor])
    // @ts-expect-error A constructor of a non-Error instance is rejected
    catchOnly(ObjectCtor)
    // @ts-expect-error A constructor of a non-Error instance is rejected
    catchOnly(NumberAbsCtor)
    // @ts-expect-error A plain object is not an error class
    catchOnly({ prototype: new Selected() })
    // @ts-expect-error A plain object is not an error class
    tryCatch(() => 1, [{ prototype: new Selected() }])
    // @ts-expect-error Bare constructors are not handlers; use a list
    tryCatch(() => 1, Selected)
    // @ts-expect-error At least one class is required
    catchOnly()
    // @ts-expect-error At least one class is required
    tryCatch(() => 1, [])
  })
})

/* A generic error class: TypeScript types the `prototype` of a generic class
   with `any` for each type parameter, which the public and the private
   constructor read differently. */
class PublicGeneric<T> extends Error {
  constructor(readonly detail: T) {
    super()
  }
}
class PrivateGeneric<T> extends Error {
  private constructor(readonly detail: T) {
    super()
  }
  static of<T>(detail: T): PrivateGeneric<T> {
    return new PrivateGeneric(detail)
  }
}
class ProtectedGeneric<T> extends Error {
  protected constructor(readonly detail: T) {
    super()
  }
  static of<T>(detail: T): ProtectedGeneric<T> {
    return new ProtectedGeneric(detail)
  }
}
class PrivateNestedGeneric<T> extends Error {
  private constructor(readonly details: readonly { readonly value: T }[]) {
    super()
  }
}
class ArrayDetail<T> extends Error {
  private constructor(readonly detail: string[] & { extra: T }) {
    super()
  }
}
class CallableDetail<T> extends Error {
  private constructor(readonly detail: (() => string) & { extra: T }) {
    super()
  }
}
class OverloadedDetail<T> extends Error {
  private constructor(readonly detail: { (): T; (format: string): string }) {
    super()
  }
}
class ConcreteDetails extends Error {
  private constructor(
    readonly array: string[] & { extra: number },
    readonly callable: (() => string) & { extra: number },
    readonly overloaded: { (): number; (format: string): string },
  ) {
    super()
  }
}
class GenericMethod extends Error {
  private constructor(readonly detail: string) {
    super()
  }
  map<U>(f: (d: string) => U): U {
    return f(this.detail)
  }
}
class ConcretePlatformFields extends Error {
  private constructor(
    readonly bytes: Uint8Array,
    readonly errorClass: typeof RangeError,
  ) {
    super()
  }
}
class SetSub<T> extends Set<string> {
  label!: T
}
class PrivateSetSub<T> extends Error {
  private constructor(readonly detail: SetSub<T>) {
    super()
  }
}
class PrivatePromiseExtra<T> extends Error {
  private constructor(readonly detail: Promise<string> & { extra: T }) {
    super()
  }
}
class PrivateSetExtra<T> extends Error {
  private constructor(readonly detail: Set<string> & { extra: T }) {
    super()
  }
}
class NineSignatures extends Error {
  private constructor(
    readonly detail: {
      (a: 1): 1
      (a: 2): 2
      (a: 3): 3
      (a: 4): 4
      (a: 5): 5
      (a: 6): 6
      (a: 7): 7
      (a: 8): 8
      (a: 9): 9
    },
  ) {
    super()
  }
}
class EightSignatures extends Error {
  private constructor(
    readonly detail: {
      (a: 1): 1
      (a: 2): 2
      (a: 3): 3
      (a: 4): 4
      (a: 5): 5
      (a: 6): 6
      (a: 7): 7
      (a: 8): 8
    },
  ) {
    super()
  }
}
class ReadonlyRest<T> extends Error {
  private constructor(readonly detail: { (...a: readonly string[]): T }) {
    super()
  }
}
class ReadonlyRestOverload<T> extends Error {
  private constructor(
    readonly detail: { (...a: readonly string[]): T; (z: 9): 9 },
  ) {
    super()
  }
}
class ReadonlyRestMethod<T> extends Error {
  private constructor() {
    super()
  }
  m(...a: readonly string[]): T {
    throw a
  }
}
class GenericReadonlyRest<T> extends Error {
  private constructor(
    readonly detail: { <U extends readonly unknown[]>(...a: U): T },
  ) {
    super()
  }
}
class EightReturns1<T> extends Error {
  private constructor(
    readonly detail: {
      (a: 1): T
      (a: 2): 2
      (a: 3): 3
      (a: 4): 4
      (a: 5): 5
      (a: 6): 6
      (a: 7): 7
      (a: 8): 8
    },
  ) {
    super()
  }
}
class EightReturns2<T> extends Error {
  private constructor(
    readonly detail: {
      (a: 1): 1
      (a: 2): T
      (a: 3): 3
      (a: 4): 4
      (a: 5): 5
      (a: 6): 6
      (a: 7): 7
      (a: 8): 8
    },
  ) {
    super()
  }
}
class EightReturns3<T> extends Error {
  private constructor(
    readonly detail: {
      (a: 1): 1
      (a: 2): 2
      (a: 3): T
      (a: 4): 4
      (a: 5): 5
      (a: 6): 6
      (a: 7): 7
      (a: 8): 8
    },
  ) {
    super()
  }
}
class EightReturns4<T> extends Error {
  private constructor(
    readonly detail: {
      (a: 1): 1
      (a: 2): 2
      (a: 3): 3
      (a: 4): T
      (a: 5): 5
      (a: 6): 6
      (a: 7): 7
      (a: 8): 8
    },
  ) {
    super()
  }
}
class EightReturns5<T> extends Error {
  private constructor(
    readonly detail: {
      (a: 1): 1
      (a: 2): 2
      (a: 3): 3
      (a: 4): 4
      (a: 5): T
      (a: 6): 6
      (a: 7): 7
      (a: 8): 8
    },
  ) {
    super()
  }
}
class EightReturns6<T> extends Error {
  private constructor(
    readonly detail: {
      (a: 1): 1
      (a: 2): 2
      (a: 3): 3
      (a: 4): 4
      (a: 5): 5
      (a: 6): T
      (a: 7): 7
      (a: 8): 8
    },
  ) {
    super()
  }
}
class EightReturns7<T> extends Error {
  private constructor(
    readonly detail: {
      (a: 1): 1
      (a: 2): 2
      (a: 3): 3
      (a: 4): 4
      (a: 5): 5
      (a: 6): 6
      (a: 7): T
      (a: 8): 8
    },
  ) {
    super()
  }
}
class EightReturns8<T> extends Error {
  private constructor(
    readonly detail: {
      (a: 1): 1
      (a: 2): 2
      (a: 3): 3
      (a: 4): 4
      (a: 5): 5
      (a: 6): 6
      (a: 7): 7
      (a: 8): T
    },
  ) {
    super()
  }
}
class PrivateAnyField extends Error {
  // `any` is the type under test.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private constructor(readonly raw: any) {
    super()
  }
}
class PrivateSignalField extends Error {
  private constructor(readonly signal: AbortSignal) {
    super()
  }
}
class PrivatePending<T> extends Error {
  private constructor(readonly pending: Promise<T>) {
    super()
  }
}
class PrivateReturn<T> extends Error {
  private constructor() {
    super()
  }
  value(): T {
    throw this
  }
}
// `T` sits four levels down (`detail`, `a`, `b`, `c`) in the first class and
// five in the second.
class PrivateFourDeep<T> extends Error {
  private constructor(
    readonly detail: { readonly a: { readonly b: { readonly c: T } } },
  ) {
    super()
  }
}
class PrivateFiveDeep<T> extends Error {
  private constructor(
    readonly detail: {
      readonly a: { readonly b: { readonly c: { readonly d: T } } }
    },
  ) {
    super()
  }
}
class PrivateMember<T> extends Error {
  private constructor(private readonly detail: T) {
    super()
  }
  describeDetail(): string {
    return typeof this.detail
  }
}
class ProtectedMember<T> extends Error {
  protected constructor(protected readonly detail: T) {
    super()
  }
  describeDetail(): string {
    return typeof this.detail
  }
}
class HashMember<T> extends Error {
  readonly #detail: T
  private constructor(detail: T) {
    super()
    this.#detail = detail
  }
  describeDetail(): string {
    return typeof this.#detail
  }
}
class PrivateConcrete extends Error {
  private constructor(readonly detail: string) {
    super()
  }
  static of(detail: string): PrivateConcrete {
    return new PrivateConcrete(detail)
  }
}
// The documented limit reads a type parameter as `any`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Unread = any
declare const decoratedConstructable: {
  (): Selected
  new (): Selected
  prototype: Selected
}

describe('a generic error class', () => {
  it('types a public constructor payload as unknown', () => {
    expectTypeOf(catchOnly(PublicGeneric)).returns.toEqualTypeOf<
      Failure<never, PublicGeneric<unknown>>
    >()
    expectTypeOf(tryCatch(() => 1, [PublicGeneric])()).toEqualTypeOf<
      Result<number, PublicGeneric<unknown>>
    >()
  })
  it('keeps a public constructor payload from being read as a string', () => {
    const caught = catchOnly(PublicGeneric)(new PublicGeneric(42))
    // @ts-expect-error The payload is `unknown`, not `any`
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    caught.detail.toUpperCase()
    expectTypeOf(caught.detail).toBeUnknown()
  })
  it('accepts a private constructor class passed as its unknown instance type', () => {
    const asUnknown =
      PrivateGeneric as unknown as abstract new () => PrivateGeneric<unknown>
    const caught = catchOnly(asUnknown)(PrivateGeneric.of(42))
    expectTypeOf(caught.detail).toBeUnknown()
    expectTypeOf(tryCatch(() => 1, [asUnknown])()).toEqualTypeOf<
      Result<number, PrivateGeneric<unknown>>
    >()
  })
  it('refuses a private or protected constructor, whose payload would be any', () => {
    // @ts-expect-error A private constructor leaves the payload `any`
    catchOnly(PrivateGeneric)
    // @ts-expect-error A private constructor leaves the payload `any`
    tryCatch(() => 1, [PrivateGeneric])
    // @ts-expect-error A protected constructor leaves the payload `any`
    catchOnly(ProtectedGeneric)
    // @ts-expect-error A protected constructor leaves the payload `any`
    tryCatch(() => 1, [ProtectedGeneric])
    // @ts-expect-error The `any` is found in a nested payload too
    catchOnly(PrivateNestedGeneric)
    // @ts-expect-error One refused class refuses the list
    catchOnly(Selected, PrivateGeneric)
  })
  it('refuses any in readonly rest returns and across the overload window', () => {
    // @ts-expect-error A checked signature returns any
    catchOnly(ReadonlyRest)
    // @ts-expect-error The same check applies to the class list
    tryCatch(() => 1, [ReadonlyRest])
    // @ts-expect-error A checked signature returns any
    catchOnly(ReadonlyRestOverload)
    // @ts-expect-error The same check applies to the class list
    tryCatch(() => 1, [ReadonlyRestOverload])
    // @ts-expect-error A checked signature returns any
    catchOnly(ReadonlyRestMethod)
    // @ts-expect-error The same check applies to the class list
    tryCatch(() => 1, [ReadonlyRestMethod])
    // @ts-expect-error A checked signature returns any
    catchOnly(GenericReadonlyRest)
    // @ts-expect-error The same check applies to the class list
    tryCatch(() => 1, [GenericReadonlyRest])
    // @ts-expect-error A checked signature returns any
    catchOnly(EightReturns1)
    // @ts-expect-error The same check applies to the class list
    tryCatch(() => 1, [EightReturns1])
    // @ts-expect-error Signature 2 returns any
    catchOnly(EightReturns2)
    // @ts-expect-error The same check applies to the class list
    tryCatch(() => 1, [EightReturns2])
    // @ts-expect-error Signature 3 returns any
    catchOnly(EightReturns3)
    // @ts-expect-error The same check applies to the class list
    tryCatch(() => 1, [EightReturns3])
    // @ts-expect-error Signature 5 returns any
    catchOnly(EightReturns5)
    // @ts-expect-error The same check applies to the class list
    tryCatch(() => 1, [EightReturns5])
    // @ts-expect-error Signature 6 returns any
    catchOnly(EightReturns6)
    // @ts-expect-error The same check applies to the class list
    tryCatch(() => 1, [EightReturns6])
    // @ts-expect-error Signature 7 returns any
    catchOnly(EightReturns7)
    // @ts-expect-error The same check applies to the class list
    tryCatch(() => 1, [EightReturns7])
    // @ts-expect-error A checked signature returns any
    catchOnly(EightReturns4)
    // @ts-expect-error The same check applies to the class list
    tryCatch(() => 1, [EightReturns4])
    // @ts-expect-error A checked signature returns any
    catchOnly(EightReturns8)
    // @ts-expect-error The same check applies to the class list
    tryCatch(() => 1, [EightReturns8])
  })
  it('accepts concrete generic methods, platform fields and eight call signatures', () => {
    expectTypeOf(catchOnly(GenericMethod)).returns.toEqualTypeOf<
      Failure<never, GenericMethod>
    >()
    expectTypeOf(tryCatch(() => 1, [GenericMethod])()).toEqualTypeOf<
      Result<number, GenericMethod>
    >()
    expectTypeOf(catchOnly(ConcretePlatformFields)).returns.toEqualTypeOf<
      Failure<never, ConcretePlatformFields>
    >()
    expectTypeOf(tryCatch(() => 1, [ConcretePlatformFields])()).toEqualTypeOf<
      Result<number, ConcretePlatformFields>
    >()
    expectTypeOf(catchOnly(EightSignatures)).returns.toEqualTypeOf<
      Failure<never, EightSignatures>
    >()
    expectTypeOf(tryCatch(() => 1, [EightSignatures])()).toEqualTypeOf<
      Result<number, EightSignatures>
    >()
  })
  it('refuses any in named Set and Promise properties and more than eight call signatures', () => {
    // @ts-expect-error The Set subclass property holds any
    catchOnly(PrivateSetSub)
    // @ts-expect-error The Set subclass property holds any
    tryCatch(() => 1, [PrivateSetSub])
    // @ts-expect-error The Promise property holds any
    catchOnly(PrivatePromiseExtra)
    // @ts-expect-error The Promise property holds any
    tryCatch(() => 1, [PrivatePromiseExtra])
    // @ts-expect-error The Set property holds any
    catchOnly(PrivateSetExtra)
    // @ts-expect-error The Set property holds any
    tryCatch(() => 1, [PrivateSetExtra])
    // @ts-expect-error More than eight call signatures
    catchOnly(NineSignatures)
    // @ts-expect-error More than eight call signatures
    tryCatch(() => 1, [NineSignatures])
  })
  it('refuses any in array or callable properties or an earlier overload return', () => {
    // @ts-expect-error The named array property holds any
    catchOnly(ArrayDetail)
    // @ts-expect-error The named array property holds any
    tryCatch(() => 1, [ArrayDetail])
    // @ts-expect-error The named callable property holds any
    catchOnly(CallableDetail)
    // @ts-expect-error The named callable property holds any
    tryCatch(() => 1, [CallableDetail])
    // @ts-expect-error The earlier overload returns any
    catchOnly(OverloadedDetail)
    // @ts-expect-error The earlier overload returns any
    tryCatch(() => 1, [OverloadedDetail])
    expectTypeOf(catchOnly(ConcreteDetails)).returns.toEqualTypeOf<
      Failure<never, ConcreteDetails>
    >()
    expectTypeOf(tryCatch(() => 1, [ConcreteDetails])()).toEqualTypeOf<
      Result<number, ConcreteDetails>
    >()
  })
  it('refuses a private constructor with no type parameter whose prototype holds any', () => {
    // @ts-expect-error The `any` field is read through the prototype
    catchOnly(PrivateAnyField)
    // @ts-expect-error An `AbortSignal` field holds `any`
    tryCatch(() => 1, [PrivateSignalField])
  })
  it('accepts such a class passed as a constructor type fixing its instance type', () => {
    const asInstance =
      PrivateSignalField as unknown as abstract new () => PrivateSignalField
    expectTypeOf(catchOnly(asInstance)).returns.toEqualTypeOf<
      Failure<never, PrivateSignalField>
    >()
  })
  it('does not look inside a Promise, so a type parameter used only there still reads as any', () => {
    // The documented limit of the check
    expectTypeOf(catchOnly(PrivatePending)).returns.toEqualTypeOf<
      Failure<never, PrivatePending<Unread>>
    >()
  })
  it('does not look inside a non-public member, so a type parameter used only there still reads as any', () => {
    // The documented limit of the check: `keyof` skips `private`,
    // `protected` and `#` members
    expectTypeOf(catchOnly(PrivateMember)).returns.toEqualTypeOf<
      Failure<never, PrivateMember<Unread>>
    >()
    expectTypeOf(catchOnly(ProtectedMember)).returns.toEqualTypeOf<
      Failure<never, ProtectedMember<Unread>>
    >()
    expectTypeOf(catchOnly(HashMember)).returns.toEqualTypeOf<
      Failure<never, HashMember<Unread>>
    >()
  })
  it('refuses a type parameter used only in a method return', () => {
    // @ts-expect-error A function's return is read, so the `any` is found
    catchOnly(PrivateReturn)
    // @ts-expect-error The same through the `tryCatch` list
    tryCatch(() => 1, [PrivateReturn])
  })
  it('reads four levels of nesting and not a fifth', () => {
    // @ts-expect-error The deepest level the check reaches
    catchOnly(PrivateFourDeep)
    // The documented limit of the check
    expectTypeOf(catchOnly(PrivateFiveDeep)).returns.toEqualTypeOf<
      Failure<never, PrivateFiveDeep<Unread>>
    >()
  })
  it('reads a public and a private constructor class in one list', () => {
    expectTypeOf(catchOnly(Error, PrivateConcrete)).returns.toEqualTypeOf<
      Failure<never, Error | PrivateConcrete>
    >()
    expectTypeOf(
      tryCatch(() => 1, [TypeError, PrivateConcrete])(),
    ).toEqualTypeOf<Result<number, TypeError | PrivateConcrete>>()
  })
  it('still accepts a private constructor with no generic payload', () => {
    expectTypeOf(catchOnly(PrivateConcrete)).returns.toEqualTypeOf<
      Failure<never, PrivateConcrete>
    >()
    expectTypeOf(tryCatch(() => 1, [PrivateConcrete])()).toEqualTypeOf<
      Result<number, PrivateConcrete>
    >()
  })
})

const decoratedArrow = Object.assign(() => new Selected(), {
  prototype: Selected.prototype,
})
const decoratedMethod = Object.assign(
  {
    run(this: void) {
      return new Selected()
    },
  }.run,
  { prototype: Selected.prototype },
)

describe('a callable decorated with an Error prototype', () => {
  it('is refused, being no constructor', () => {
    // @ts-expect-error A callable with no construct signature is not a class
    catchOnly(decoratedArrow)
    // @ts-expect-error A callable with no construct signature is not a class
    tryCatch(() => 1, [decoratedArrow])
    // @ts-expect-error A method decorated the same way is no class either
    catchOnly(decoratedMethod)
    // @ts-expect-error A method decorated the same way is no class either
    tryCatch(() => 1, [decoratedMethod])
  })
  it('is accepted when it also has a construct signature', () => {
    expectTypeOf(catchOnly(decoratedConstructable)).returns.toEqualTypeOf<
      Failure<never, Selected>
    >()
    expectTypeOf(catchOnly(Error, TypeError)).returns.toEqualTypeOf<
      Failure<never, Error>
    >()
    expectTypeOf(tryCatch(() => 1, [Error, RangeError])()).toEqualTypeOf<
      Result<number, Error>
    >()
  })
})

type ErrorConstructorLike = abstract new (...args: never[]) => Error

describe('generic call sites', () => {
  it('still accept a constrained type parameter', () => {
    function one<C extends ErrorConstructorLike>(k: C) {
      return catchOnly(k)
    }
    function oneT<T extends Error>(k: abstract new (...args: never[]) => T) {
      return catchOnly(k)
    }
    function wrap<
      C extends readonly [ErrorConstructorLike, ...ErrorConstructorLike[]],
    >(...classes: C) {
      return catchOnly(...classes)
    }
    function list<C extends typeof Error>(k: C) {
      return tryCatch(() => 1, [k])
    }
    function listWrap<
      C extends readonly [ErrorConstructorLike, ...ErrorConstructorLike[]],
    >(...classes: C) {
      return tryCatch(() => 1, classes)
    }
    expectTypeOf(one(Selected)).returns.toEqualTypeOf<
      Failure<never, Selected>
    >()
    // Only compilation is pinned: the instantiated return type of `oneT`
    // reduces to `any`.
    oneT(Selected)
    expectTypeOf(wrap(Selected, Other)).returns.toEqualTypeOf<
      Failure<never, Selected | Other>
    >()
    expectTypeOf(list(Error)()).toEqualTypeOf<Result<number, Error>>()
    expectTypeOf(listWrap(Selected, Other)()).toEqualTypeOf<
      Result<number, Selected | Other>
    >()
  })
})
