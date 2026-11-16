import { catchOnly, tryCatch } from './index.js'
import { resultify } from '../promise/index.js'
import { resultify as callResultify } from '../call/index.js'
import { definePrimitiveValueObject } from '../value-object/index.js'
import type { Branded } from '../brand/index.js'
import { describe, expectTypeOf, it } from 'vitest'
import type {
  Collected,
  Failed,
  Failure,
  NotAGenerator,
  NotAPromise,
  NotAResult,
  NotPossiblyAnError,
  Parts,
  Result,
  Success,
  SuccessArm,
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

declare const take: Take<RangeError>
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
      Failed<{ a: Result<number, RangeError>; b: Result<string, TypeError> }>
    >().toEqualTypeOf<RangeError | TypeError>()
    expectTypeOf<Failed<{ a: number }>>().toEqualTypeOf<never>()
  })

  it('NotAGenerator names the fix for a body that returns a generator', () => {
    expectTypeOf<
      NotAGenerator<Generator<number, void, undefined>>
    >().toEqualTypeOf<'This body returns a generator — attempt runs its body to completion, so write a plain function'>()
    expectTypeOf<NotAGenerator<number[]>>().toEqualTypeOf<unknown>()
  })

  it('Take unboxes a part whose error fits E', () => {
    expectTypeOf(take(s)).toEqualTypeOf<number>()
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
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type -- the point of the pin
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
