import { describe, expect, it } from 'vitest'
import { andThen, failure, isFailure, isSuccess, success } from './index.js'

class WidgetError extends Error {
  readonly widgetId: string
  constructor(widgetId: string) {
    super(`bad widget "${widgetId}"`)
    this.name = 'WidgetError'
    this.widgetId = widgetId
  }
}

describe('andThen', () => {
  it('chains a success through to the next step', () => {
    const double = andThen((n: number) => success(n * 2))
    expect(double(success(21))).toBe(42)
  })

  it('short-circuits on an existing failure without calling the next step', () => {
    let called = false
    const step = andThen((n: number) => {
      called = true
      return success(n * 2)
    })
    const input = failure<number>(new Error('already broken'))
    const result = step(input)
    expect(called).toBe(false)
    expect(result).toBe(input)
  })

  it('propagates a failure returned by the next step itself', () => {
    const step = andThen((_n: number) => failure(new Error('step failed')))
    const result = step(success(1))
    expect(isFailure(result)).toBe(true)
    expect((result as Error).message).toBe('step failed')
  })

  it('is safe with an Error-subtype payload: a Success value that happens to carry Error-shaped data is never confused with a Failure', () => {
    // The channel discriminates by `instanceof Error`, not by shape — so a
    // chain over a genuinely non-Error success type stays Success end to
    // end, and a chain whose step legitimately fails with a domain Error
    // subclass is carried through as that same subclass, not just `Error`.
    const widgetIdOf = andThen((code: number) =>
      code > 0
        ? success(`widget-${code}`)
        : failure(new WidgetError(String(code))),
    )
    expect(widgetIdOf(success(7))).toBe('widget-7')

    const result = widgetIdOf(success(-1))
    expect(isSuccess(result)).toBe(false)
    expect(result).toBeInstanceOf(WidgetError)
    expect((result as WidgetError).widgetId).toBe('-1')
  })

  it('composes multiple steps left to right', () => {
    const timesTen = andThen((n: number) => success(n * 10))
    const plusOne = andThen((n: number) => success(n + 1))
    expect(plusOne(timesTen(success(4)))).toBe(41)
  })
})
