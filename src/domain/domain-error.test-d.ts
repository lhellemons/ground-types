import { describe, expectTypeOf, it } from 'vitest'
import { DomainError } from './index.js'
import type { DTOSource, ErrorDTO, JSONValue } from './index.js'
import { catchOnly } from '../result/index.js'
import type { Failure } from '../result/index.js'

class A extends DomainError<'a', { id: string }> {}
class B extends DomainError<'b', readonly number[]> {}
class Empty {}
class IndexedEmpty {
  readonly [key: string]: JSONValue
}
class Named {
  value = 1
}
class Method {
  run() {}
}

describe('DomainError types', () => {
  it('narrows subclasses by code', () => {
    const narrow = (error: A | B) => {
      if (error.code === 'a') {
        expectTypeOf(error).toEqualTypeOf<A>()
        expectTypeOf(error.params).toEqualTypeOf<{ id: string }>()
      } else {
        expectTypeOf(error).toEqualTypeOf<B>()
      }
    }
    expectTypeOf(narrow).toBeFunction()
    expectTypeOf<A>().toExtend<DTOSource<ErrorDTO<'a', { id: string }>>>()
    expectTypeOf(catchOnly(A)).returns.toEqualTypeOf<Failure<never, A>>()
    expectTypeOf(catchOnly(DomainError)).returns.toEqualTypeOf<
      Failure<never, DomainError<string, JSONValue>>
    >()
  })

  it('bounds nested JSON values and pins structural class limits', () => {
    expectTypeOf<{
      readonly nested: readonly [null, string, number, boolean]
    }>().toExtend<JSONValue>()
    expectTypeOf<Empty>().not.toExtend<JSONValue>()
    expectTypeOf<IndexedEmpty>().toExtend<JSONValue>()
    expectTypeOf<Named>().not.toExtend<JSONValue>()
    expectTypeOf<Method>().not.toExtend<JSONValue>()
    expectTypeOf<Date>().not.toExtend<JSONValue>()
    expectTypeOf<Map<string, string>>().not.toExtend<JSONValue>()
    expectTypeOf<Set<string>>().not.toExtend<JSONValue>()
    expectTypeOf<RegExp>().not.toExtend<JSONValue>()
    expectTypeOf<() => void>().not.toExtend<JSONValue>()
    expectTypeOf<bigint>().not.toExtend<JSONValue>()
    expectTypeOf<undefined>().not.toExtend<JSONValue>()
    expectTypeOf<{ value: undefined }>().not.toExtend<JSONValue>()
    expectTypeOf<{ nested: { value: undefined } }>().not.toExtend<JSONValue>()
    // @ts-expect-error params must be JSON-valued
    type Invalid = ErrorDTO<'invalid', Date>
    expectTypeOf<Invalid>().toBeObject()
  })
})
