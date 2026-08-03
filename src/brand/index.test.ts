import { describe, expect, it } from 'vitest'
import type { Branded } from './index.js'

// Tuple-wrapped so the check doesn't distribute over union types.
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type Expect<T extends true> = T

describe('Branded', () => {
  it('has no runtime representation — this block only exists to host type checks', () => {
    expect(true).toBe(true)
  })

  type UserId = Branded<string, 'UserId'>
  type OrderId = Branded<string, 'OrderId'>

  // Two differently-Branded types over the same underlying primitive are not
  // interchangeable, even though they are structurally identical at runtime.
  type _UserIdIsNotOrderId = Expect<
    Equal<UserId extends OrderId ? true : false, false>
  >
  type _OrderIdIsNotUserId = Expect<
    Equal<OrderId extends UserId ? true : false, false>
  >

  // A Branded value is still assignable to its underlying primitive type —
  // the brand only restricts what can flow the other way.
  type _BrandedAssignableToUnderlying = Expect<
    Equal<UserId extends string ? true : false, true>
  >
  type _UnderlyingNotAssignableToBranded = Expect<
    Equal<string extends UserId ? true : false, false>
  >

  const _typeTests: [
    _UserIdIsNotOrderId,
    _OrderIdIsNotUserId,
    _BrandedAssignableToUnderlying,
    _UnderlyingNotAssignableToBranded,
  ] = [true, true, true, true]
  void _typeTests
})
