import { describe, expect, it } from 'vitest'
import { pipe } from '../fn/index.js'
import { failure, success } from '../result/index.js'
import type { Result } from '../result/index.js'
import {
  andThen,
  bestEffort,
  gather,
  map,
  note,
  recover,
  recoverWith,
  toResult,
} from './index.js'
import type { BestEffort } from './index.js'

class ListError extends Error {
  constructor(readonly list: readonly unknown[]) {
    super('list')
  }
}
const toList = (d: readonly unknown[]) => new ListError(d)
const frozen = (be: BestEffort<unknown, unknown>) =>
  Object.isFrozen(be) && Object.isFrozen(be.diagnostics)
const caught = (run: () => unknown): unknown => {
  try {
    run()
  } catch (e) {
    return e
  }
  return 'nothing thrown'
}
const FALSY = [undefined, null, 0, '', false] as const

describe('the kit', () => {
  it('bestEffort copies and freezes: a later push to the source list is not seen, the box and its list are frozen', () => {
    const diagnostics = ['d']
    const be = bestEffort(1, diagnostics)
    diagnostics.push('later')
    expect(be.diagnostics).toEqual(['d'])
    expect(frozen(be)).toBe(true)
  })
  it("andThen: the first step's diagnostics, then the second's, both in order, duplicates kept within and across the steps; applied and curried alike; frozen, also when the first box is clean and fn returns an unfrozen literal; a throw from fn propagates by identity", () => {
    const second = (x: number) => bestEffort(x + 1, ['b', 'c', 'd', 'c'])
    const expected = {
      value: 2,
      diagnostics: ['a', 'a', 'b', 'b', 'c', 'd', 'c'],
    }
    const applied = andThen(second, bestEffort(1, ['a', 'a', 'b']))
    expect(applied).toEqual(expected)
    const curried = andThen(second)(bestEffort(1, ['a', 'a', 'b']))
    expect(curried).toEqual(expected)
    expect(frozen(applied)).toBe(true)
    expect(frozen(curried)).toBe(true)
    const literal: BestEffort<number, string> = { value: 2, diagnostics: ['x'] }
    const passedThrough = andThen(() => literal, bestEffort(1))
    expect(passedThrough).toEqual({ value: 2, diagnostics: ['x'] })
    expect(passedThrough).not.toBe(literal)
    expect(frozen(passedThrough)).toBe(true)
    const passedThroughCurried = andThen(() => literal)(bestEffort(1))
    expect(passedThroughCurried).toEqual({ value: 2, diagnostics: ['x'] })
    expect(passedThroughCurried).not.toBe(literal)
    expect(frozen(passedThroughCurried)).toBe(true)
    const thrown = new TypeError('from fn')
    const throwing = () => {
      throw thrown
    }
    const throwingPlain = () => {
      throw 'plain'
    }
    expect(caught(() => andThen(throwing, bestEffort(1)))).toBe(thrown)
    expect(caught(() => andThen(throwing)(bestEffort(1)))).toBe(thrown)
    expect(caught(() => andThen(throwingPlain, bestEffort(1)))).toBe('plain')
    expect(caught(() => andThen(throwingPlain)(bestEffort(1)))).toBe('plain')
  })
  it('map keeps the diagnostics in order; applied and curried alike; frozen; a throw from fn propagates by identity', () => {
    const list = ['a', 'b', 'a', 'c']
    const expected = { value: 2, diagnostics: ['a', 'b', 'a', 'c'] }
    const applied = map((x: number) => x * 2, bestEffort(1, list))
    expect(applied).toEqual(expected)
    const curried = map((x: number) => x * 2)(bestEffort(1, list))
    expect(curried).toEqual(expected)
    expect(frozen(applied)).toBe(true)
    expect(frozen(curried)).toBe(true)
    const thrown = new TypeError('from fn')
    const throwing = () => {
      throw thrown
    }
    const throwingPlain = () => {
      throw 'plain'
    }
    expect(caught(() => map(throwing, bestEffort(1)))).toBe(thrown)
    expect(caught(() => map(throwing)(bestEffort(1)))).toBe(thrown)
    expect(caught(() => map(throwingPlain, bestEffort(1)))).toBe('plain')
    expect(caught(() => map(throwingPlain)(bestEffort(1)))).toBe('plain')
  })
  it("note appends after the ones held, in its own order, duplicates kept within the added list and against the held one, the caller's array untouched; applied and curried alike; frozen", () => {
    const added = ['b', 'c', 'd', 'c']
    const expected = { value: 1, diagnostics: ['a', 'b', 'b', 'c', 'd', 'c'] }
    const applied = note(added, bestEffort(1, ['a', 'b']))
    expect(applied).toEqual(expected)
    const curried = note(added)(bestEffort(1, ['a', 'b']))
    expect(curried).toEqual(expected)
    expect(added).toEqual(['b', 'c', 'd', 'c'])
    expect(frozen(applied)).toBe(true)
    expect(frozen(curried)).toBe(true)
  })
  it('gather: values in part order, diagnostics in part order and within a part, duplicates kept, an empty list gives an empty box; frozen', () => {
    const g = gather([
      bestEffort(1, ['a', 'a', 'b']),
      bestEffort(2),
      bestEffort(3, ['b', 'a']),
    ])
    expect(g).toEqual({
      value: [1, 2, 3],
      diagnostics: ['a', 'a', 'b', 'b', 'a'],
    })
    expect(gather([])).toEqual({ value: [], diagnostics: [] })
    expect(frozen(g)).toBe(true)
    expect(Object.isFrozen(g.value)).toBe(false)
  })
  it('recover: a Success is itself with no diagnostic, success(undefined) and success(null) included; a Failure is the fallback with the error itself; applied and curried alike; both arms frozen', () => {
    const err = new RangeError('bad')
    const empty = { value: 1, diagnostics: [] }
    expect(recover(0, success(1))).toEqual(empty)
    expect(recover(0)(success(1))).toEqual(empty)
    const ofUndefined = success(undefined) as Result<string | undefined, Error>
    const ofNull = success(null) as Result<string | null, Error>
    const none = { value: undefined, diagnostics: [] }
    const nul = { value: null, diagnostics: [] }
    expect(recover<string | undefined, Error>('fb', ofUndefined)).toEqual(none)
    expect(recover<string | undefined>('fb')(ofUndefined)).toEqual(none)
    expect(recover<string | null, Error>('fb', ofNull)).toEqual(nul)
    expect(recover<string | null>('fb')(ofNull)).toEqual(nul)
    const applied = recover(0, failure(err))
    expect(applied).toEqual({ value: 0, diagnostics: [err] })
    expect(applied.diagnostics[0]).toBe(err)
    expect(recover(0)(failure(err))).toEqual({ value: 0, diagnostics: [err] })
    for (const be of [
      applied,
      recover(0)(failure(err)),
      recover(0, success(1)),
      recover(0)(success(1)),
    ])
      expect(frozen(be)).toBe(true)
  })
  it('recoverWith: diagnose(error) is the one diagnostic on a Failure, handed the error itself, and is not called on a Success, success(undefined) and success(null) included; a throw from diagnose propagates by identity, Error or not; applied and curried alike; both arms frozen', () => {
    const err = new RangeError('bad')
    const seen: unknown[] = []
    const diagnose = (e: RangeError) => {
      seen.push(e)
      return e.message
    }
    const failed = { value: 0, diagnostics: ['bad'] }
    expect(recoverWith(0, diagnose, failure(err))).toEqual(failed)
    expect(recoverWith(0, diagnose)(failure(err))).toEqual(failed)
    const clean = { value: 1, diagnostics: [] }
    expect(recoverWith(0, diagnose, success(1))).toEqual(clean)
    expect(recoverWith(0, diagnose)(success(1))).toEqual(clean)
    const ofUndefined = success(undefined) as Result<string | undefined, Error>
    const ofNull = success(null) as Result<string | null, Error>
    const d = (e: Error) => e.message
    const none = { value: undefined, diagnostics: [] }
    const nul = { value: null, diagnostics: [] }
    expect(
      recoverWith<string | undefined, Error, string>('fb', d, ofUndefined),
    ).toEqual(none)
    expect(
      recoverWith<string | undefined, Error, string>('fb', d)(ofUndefined),
    ).toEqual(none)
    expect(recoverWith<string | null, Error, string>('fb', d, ofNull)).toEqual(
      nul,
    )
    expect(recoverWith<string | null, Error, string>('fb', d)(ofNull)).toEqual(
      nul,
    )
    expect(seen).toEqual([err, err])
    expect(seen[0]).toBe(err)
    const made = { m: 1 }
    expect(recoverWith(0, () => made, failure(err)).diagnostics[0]).toBe(made)
    for (const be of [
      recoverWith(0, diagnose, failure(err)),
      recoverWith(0, diagnose)(failure(err)),
      recoverWith(0, diagnose, success(1)),
      recoverWith(0, diagnose)(success(1)),
    ])
      expect(frozen(be)).toBe(true)
    const thrown = new TypeError('from diagnose')
    const throwing = () => {
      throw thrown
    }
    const throwingPlain = () => {
      throw 'plain'
    }
    expect(caught(() => recoverWith(0, throwing, failure(err)))).toBe(thrown)
    expect(caught(() => recoverWith(0, throwing)(failure(err)))).toBe(thrown)
    expect(caught(() => recoverWith(0, throwingPlain, failure(err)))).toBe(
      'plain',
    )
    expect(caught(() => recoverWith(0, throwingPlain)(failure(err)))).toBe(
      'plain',
    )
  })
  it('toResult: a Success of the value when the list is empty; else a Failure of toError(list), the whole list in order, falsy diagnostics counted; applied and curried alike', () => {
    expect(toResult(toList, bestEffort(1))).toBe(1)
    expect(toResult(toList)(bestEffort(1))).toBe(1)
    const failed = toResult(toList, bestEffort(1, ['a', 'b', 'a']))
    expect(failed).toBeInstanceOf(ListError)
    expect((failed as ListError).list).toEqual(['a', 'b', 'a'])
    expect(
      (toResult(toList)(bestEffort(1, ['a', 'b'])) as ListError).list,
    ).toEqual(['a', 'b'])
    for (const falsy of FALSY) {
      for (const r of [
        toResult(toList, bestEffort(1, [falsy])),
        toResult(toList)(bestEffort(1, [falsy])),
      ]) {
        expect(r).toBeInstanceOf(ListError)
        expect((r as ListError).list).toEqual([falsy])
      }
    }
  })
  it("toResult hands toError the box's own list and returns what toError returns, by identity", () => {
    const be = bestEffort(1, ['d'])
    let received: unknown
    const made = new ListError([])
    const r = toResult((d) => {
      received = d
      return made
    }, be)
    expect(received).toBe(be.diagnostics)
    expect(r).toBe(made)
  })
  it('toResult: a throw from toError propagates by identity, Error or not, applied and curried, and toError is not called on an empty list', () => {
    const thrown = new TypeError('from toError')
    const throwing = () => {
      throw thrown
    }
    const throwingPlain = () => {
      throw 'plain'
    }
    expect(caught(() => toResult(throwing, bestEffort(1, ['d'])))).toBe(thrown)
    expect(caught(() => toResult(throwing)(bestEffort(1, ['d'])))).toBe(thrown)
    expect(caught(() => toResult(throwingPlain, bestEffort(1, ['d'])))).toBe(
      'plain',
    )
    expect(caught(() => toResult(throwingPlain)(bestEffort(1, ['d'])))).toBe(
      'plain',
    )
    expect(toResult(throwing, bestEffort(1))).toBe(1)
    expect(toResult(throwing)(bestEffort(1))).toBe(1)
  })
  it('frozen one level deep: the value is not frozen by the box', () => {
    expect(Object.isFrozen(bestEffort({}).value)).toBe(false)
    expect(Object.isFrozen(bestEffort(1, [{ m: 1 }]).diagnostics[0])).toBe(
      false,
    )
    const bad: Result<{ id: string }, RangeError> = failure(
      new RangeError('bad'),
    )
    expect(
      Object.isFrozen(map(() => ({ id: 'new' }), bestEffort(1)).value),
    ).toBe(false)
    expect(
      Object.isFrozen(map(() => ({ id: 'new' }))(bestEffort(1)).value),
    ).toBe(false)
    expect(
      Object.isFrozen(
        andThen(() => bestEffort({ id: 'n' }), bestEffort(1)).value,
      ),
    ).toBe(false)
    expect(
      Object.isFrozen(
        andThen(() => bestEffort({ id: 'n' }))(bestEffort(1)).value,
      ),
    ).toBe(false)
    expect(Object.isFrozen(recover({ id: 'fb' }, bad).value)).toBe(false)
    expect(Object.isFrozen(recover({ id: 'fb' })(bad).value)).toBe(false)
    expect(
      Object.isFrozen(recoverWith({ id: 'fb' }, () => 'd', bad).value),
    ).toBe(false)
    expect(
      Object.isFrozen(recoverWith({ id: 'fb' }, () => 'd')(bad).value),
    ).toBe(false)
  })
  it('map, gather and note on a box without diagnostics throw a TypeError', () => {
    const malformed = JSON.parse('{"value":1}') as BestEffort<number, string>
    expect(caught(() => map((x: number) => x, malformed))).toBeInstanceOf(
      TypeError,
    )
    expect(caught(() => map((x: number) => x)(malformed))).toBeInstanceOf(
      TypeError,
    )
    expect(caught(() => gather([malformed]))).toBeInstanceOf(TypeError)
    expect(caught(() => note(['n'], malformed))).toBeInstanceOf(TypeError)
    expect(caught(() => note(['n'])(malformed))).toBeInstanceOf(TypeError)
  })
  it('gather flattens the diagnostics one level only, does not freeze the caller parts array, and takes the same part twice as two values and its diagnostics twice', () => {
    expect(gather([bestEffort(1, [['a', 'b']])]).diagnostics).toEqual([
      ['a', 'b'],
    ])
    const parts = [bestEffort(1, ['a']), bestEffort(2)]
    gather(parts)
    expect(Object.isFrozen(parts)).toBe(false)
    const x = bestEffort(1, ['a', 'b'])
    expect(gather([x, x])).toEqual({
      value: [1, 1],
      diagnostics: ['a', 'b', 'a', 'b'],
    })
  })
  it('andThen leaves the diagnostics of the literal box its callback returns unfrozen, applied and curried', () => {
    const literal: BestEffort<number, string> = { value: 2, diagnostics: ['x'] }
    andThen(() => literal, bestEffort(1, ['a']))
    andThen(() => literal)(bestEffort(1, ['a']))
    expect(Object.isFrozen(literal)).toBe(false)
    expect(Object.isFrozen(literal.diagnostics)).toBe(false)
  })
  it('a plain object literal is a BestEffort structurally: toResult reads it, and map returns a frozen box from it', () => {
    const literal: BestEffort<number, string> = { value: 1, diagnostics: ['d'] }
    expect(toResult(toList, literal)).toBeInstanceOf(ListError)
    expect(frozen(map((x: number) => x, literal))).toBe(true)
  })
  it('a box inside a container leaves toResult inside the Success, diagnostics and all', () => {
    const inner = bestEffort(1, ['lost'])
    expect(toResult(toList, bestEffort([inner]))).toEqual([inner])
    expect(toResult(toList, bestEffort({ inner }))).toEqual({ inner })
    expect(toResult(toList, gather([bestEffort(inner)]))).toEqual([inner])
  })
  it('a box behind the declared type { readonly value: number } leaves toResult inside the Success, as that box with its list', () => {
    const declared = map(
      (x: number): { readonly value: number } => bestEffort(x, ['lost']),
      bestEffort(1),
    )
    const out = toResult(toList, declared)
    expect(out).toBe(declared.value)
    expect(out).toEqual({ value: 1, diagnostics: ['lost'] })
  })
  it('the curried forms run in pipe', () => {
    const r: Result<number, RangeError> = failure(new RangeError('bad'))
    expect(
      pipe(
        r,
        recover(0),
        map((x: number) => x + 1),
        note(['n']),
        andThen((x: number) => bestEffort(String(x), ['a'])),
        toResult(toList),
      ),
    ).toBeInstanceOf(ListError)
    expect(
      pipe(
        success(1) as Result<number, RangeError>,
        recover(0),
        map((x: number) => x + 1),
        toResult(toList),
      ),
    ).toBe(2)
  })

  it('toResult of a nullish value with an empty list is a Success of that value, applied and curried', () => {
    expect(toResult(toList, bestEffort(undefined))).toBe(undefined)
    expect(toResult(toList)(bestEffort(undefined))).toBe(undefined)
    expect(toResult(toList, bestEffort(null))).toBe(null)
    expect(toResult(toList)(bestEffort(null))).toBe(null)
  })
  it('an object Success is itself through recover and recoverWith, applied and curried', () => {
    const value = { id: 'a' }
    const ok: Result<{ id: string }, RangeError> = success(value)
    const diagnose = (e: RangeError) => e.message
    expect(recover({ id: 'fb' }, ok).value).toBe(value)
    expect(recover({ id: 'fb' })(ok).value).toBe(value)
    expect(recoverWith({ id: 'fb' }, diagnose, ok).value).toBe(value)
    expect(recoverWith({ id: 'fb' }, diagnose)(ok).value).toBe(value)
  })
  it('an object value keeps its identity through the constructor, the map and andThen callback argument, note, gather and a recover fallback', () => {
    const value = { id: 'a' }
    expect(bestEffort(value).value).toBe(value)
    const seen: unknown[] = []
    const spy = (x: { id: string }) => {
      seen.push(x)
      return x
    }
    expect(map(spy, bestEffort(value)).value).toBe(value)
    expect(map(spy)(bestEffort(value)).value).toBe(value)
    expect(
      andThen((x: { id: string }) => bestEffort(spy(x)), bestEffort(value))
        .value,
    ).toBe(value)
    expect(
      andThen((x: { id: string }) => bestEffort(spy(x)))(bestEffort(value))
        .value,
    ).toBe(value)
    expect(seen).toHaveLength(4)
    for (const s of seen) expect(s).toBe(value)
    expect(note(['n'], bestEffort(value)).value).toBe(value)
    expect(note(['n'])(bestEffort(value)).value).toBe(value)
    expect(gather([bestEffort(value)]).value[0]).toBe(value)
    const fallback = { id: 'fb' }
    const bad: Result<{ id: string }, RangeError> = failure(
      new RangeError('bad'),
    )
    expect(recover(fallback, bad).value).toBe(fallback)
    expect(recover(fallback)(bad).value).toBe(fallback)
    expect(recoverWith(fallback, () => 'd', bad).value).toBe(fallback)
    expect(recoverWith(fallback, () => 'd')(bad).value).toBe(fallback)
  })
  it("the curried toResult hands toError the box's own list and returns toError's own result, by identity", () => {
    const be = bestEffort(1, ['d'])
    let received: unknown
    const made = new ListError([])
    const r = toResult((d: readonly string[]) => {
      received = d
      return made
    })(be)
    expect(received).toBe(be.diagnostics)
    expect(r).toBe(made)
  })
  it('the curried recoverWith stores what diagnose returns, by identity, and hands diagnose the error itself', () => {
    const err = new RangeError('bad')
    const made = { m: 1 }
    let received: unknown
    const be = recoverWith(0, (e: RangeError) => {
      received = e
      return made
    })(failure(err))
    expect(be.diagnostics[0]).toBe(made)
    expect(received).toBe(err)
  })
  it('note([], literal) returns a new frozen box; note does not freeze the caller array; map over a literal copies its list; gather of one part and of none gives an unfrozen value array', () => {
    const literal: BestEffort<number, string> = { value: 1, diagnostics: ['a'] }
    const noted = note([], literal)
    expect(noted).not.toBe(literal)
    expect(noted).toEqual({ value: 1, diagnostics: ['a'] })
    expect(frozen(noted)).toBe(true)
    const callers = ['n']
    note(callers, bestEffort(1))
    note(callers)(bestEffort(1))
    expect(Object.isFrozen(callers)).toBe(false)
    const mapped = map((x: number) => x, literal)
    expect(mapped.diagnostics).not.toBe(literal.diagnostics)
    expect(Object.isFrozen(literal.diagnostics)).toBe(false)
    expect(Object.isFrozen(gather([bestEffort(1)]).value)).toBe(false)
    expect(Object.isFrozen(gather([]).value)).toBe(false)
  })
  it('map, andThen, note, gather and recoverWith keep undefined, null, 0, empty-string and false diagnostics, in order', () => {
    const list = [...FALSY]
    expect(map((x: number) => x, bestEffort(1, list)).diagnostics).toEqual(list)
    expect(map((x: number) => x)(bestEffort(1, list)).diagnostics).toEqual(list)
    expect(
      andThen((x: number) => bestEffort(x, list), bestEffort(1)).diagnostics,
    ).toEqual(list)
    expect(
      andThen((x: number) => bestEffort(x))(bestEffort(1, list)).diagnostics,
    ).toEqual(list)
    expect(note(list, bestEffort(1)).diagnostics).toEqual(list)
    expect(note(['x'])(bestEffort(1, list)).diagnostics).toEqual([...list, 'x'])
    expect(
      gather([bestEffort(1, list), bestEffort(2, list)]).diagnostics,
    ).toEqual([...list, ...list])
    const bad: Result<number, RangeError> = failure(new RangeError('bad'))
    for (const falsy of FALSY) {
      expect(recoverWith(0, () => falsy, bad).diagnostics).toEqual([falsy])
      expect(recoverWith(0, () => falsy)(bad).diagnostics).toEqual([falsy])
    }
  })
  it('map and andThen keep a nullish new value, gather keeps nullish part values, and recover and recoverWith accept a nullish fallback', () => {
    expect(map(() => undefined, bestEffort(1)).value).toBe(undefined)
    expect(map(() => null)(bestEffort(1)).value).toBe(null)
    expect(andThen(() => bestEffort(undefined), bestEffort(1)).value).toBe(
      undefined,
    )
    expect(andThen(() => bestEffort(null))(bestEffort(1)).value).toBe(null)
    expect(
      gather([bestEffort(undefined), bestEffort(null), bestEffort(0)]).value,
    ).toEqual([undefined, null, 0])
    const bad = failure(new RangeError('bad')) as Result<
      string | undefined | null,
      RangeError
    >
    expect(recover(undefined, bad).value).toBe(undefined)
    expect(recover(null, bad).value).toBe(null)
    expect(recoverWith(undefined, () => 'd', bad).value).toBe(undefined)
    expect(recoverWith(null, () => 'd', bad).value).toBe(null)
  })
  it("map's callback and toError are called once, applied and curried", () => {
    let calls = 0
    const count = (x: number) => {
      calls += 1
      return x
    }
    map(count, bestEffort(1))
    expect(calls).toBe(1)
    map(count)(bestEffort(1))
    expect(calls).toBe(2)
    let errors = 0
    const toError = (d: readonly string[]) => {
      errors += 1
      return new ListError(d)
    }
    toResult(toError, bestEffort(1, ['d']))
    expect(errors).toBe(1)
    toResult(toError)(bestEffort(1, ['d']))
    expect(errors).toBe(2)
  })
  it('a curried map, note, andThen and toResult applied to two different boxes give two results', () => {
    const doubled = map((x: number) => x * 2)
    expect(doubled(bestEffort(1, ['a'])).value).toBe(2)
    expect(doubled(bestEffort(5, ['b']))).toEqual({
      value: 10,
      diagnostics: ['b'],
    })
    const noted = note(['n'])
    expect(noted(bestEffort(1, ['a'])).diagnostics).toEqual(['a', 'n'])
    expect(noted(bestEffort(2)).diagnostics).toEqual(['n'])
    const chained = andThen((x: number) => bestEffort(x + 1, ['s']))
    expect(chained(bestEffort(1, ['a']))).toEqual({
      value: 2,
      diagnostics: ['a', 's'],
    })
    expect(chained(bestEffort(5))).toEqual({ value: 6, diagnostics: ['s'] })
    const out = toResult(toList)
    expect(out(bestEffort(1))).toBe(1)
    expect(out(bestEffort(2, ['d']))).toBeInstanceOf(ListError)
    expect(out(bestEffort(3))).toBe(3)
  })
})
