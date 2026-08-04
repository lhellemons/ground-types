import { describe, expectTypeOf, it } from 'vitest'
import type {
  AbortContext,
  Fulfilled,
  Initial,
  Pending,
  Rejected,
  Settled,
  State,
  TrackedState,
} from './index.js'

/**
 * Pins `/promise`'s type-only exports — invisible at runtime, so untouched
 * by `test/api-surface/promise.test.ts`. Referencing each by name means a
 * removal or rename fails typecheck instead of silently dropping from the
 * public surface. See that file's docblock for the full rationale.
 */
describe('/promise type exports', () => {
  it('AbortContext exposes a readonly AbortSignal', () => {
    expectTypeOf<AbortContext>().toEqualTypeOf<{
      readonly signal: AbortSignal
    }>()
  })

  it('Initial, Pending and Rejected are the fixed, non-generic State cases', () => {
    expectTypeOf<Initial>().toEqualTypeOf<{ status: 'initial' }>()
    expectTypeOf<Pending>().toEqualTypeOf<{ status: 'pending' }>()
    expectTypeOf<Rejected>().toEqualTypeOf<{
      status: 'rejected'
      reason: unknown
    }>()
  })

  it('Fulfilled<O> carries the produced value', () => {
    expectTypeOf<Fulfilled<number>>().toEqualTypeOf<{
      status: 'fulfilled'
      value: number
    }>()
  })

  it('Settled<O> is Fulfilled<O> or Rejected', () => {
    expectTypeOf<Settled<number>>().toEqualTypeOf<
      Fulfilled<number> | Rejected
    >()
  })

  it('State<O> is Initial, Pending or Settled<O>', () => {
    expectTypeOf<State<number>>().toEqualTypeOf<
      Initial | Pending | Settled<number>
    >()
  })

  it('TrackedState<O> exposes a readonly current State<O>', () => {
    expectTypeOf<TrackedState<number>>().toEqualTypeOf<{
      readonly current: State<number>
    }>()
  })
})
