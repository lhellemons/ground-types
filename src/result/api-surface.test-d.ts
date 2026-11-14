import { catchOnly, tryCatch } from './index.js'
import { resultify } from '../promise/index.js'
import { resultify as callResultify } from '../call/index.js'
import { definePrimitiveValueObject } from '../value-object/index.js'
import type { Branded } from '../brand/index.js'
import { describe, expectTypeOf, it } from 'vitest'
import type {
  Failure,
  NotAPromise,
  NotAResult,
  Result,
  Success,
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

  it('NotAPromise names the sanctioned lift for a callback returning a Promise', () => {
    expectTypeOf<
      NotAPromise<Promise<number>>
    >().toEqualTypeOf<'This callback returns a Promise (or thenable) — resolve it first with promise/resultify or call/resultify, then compose with .then()'>()
  })
})

class Selected extends Error {
  readonly selected = true
}
class Other extends Error {
  readonly other = true
}
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
    // @ts-expect-error Bare constructors are not handlers; use a list
    tryCatch(() => 1, Selected)
    // @ts-expect-error At least one class is required
    catchOnly()
    // @ts-expect-error At least one class is required
    tryCatch(() => 1, [])
  })
})
