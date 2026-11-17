/* PROTOTYPE #117 — throwaway runtime probes: each combinator's order,
   copying and freezing; the consumer's documents through the port; the
   two projections; what leaves through toResult. Named outside vitest's
   default pattern so the root suite never runs it. */
import { describe, expect, it } from 'vitest'
import {
  failure,
  isFailure,
  isSuccess,
  success,
} from '../../src/result/index.js'
import type { Result } from '../../src/result/index.js'
import { pipe } from '../../src/fn/index.js'
import {
  andThen,
  bestEffort,
  gather,
  map,
  note,
  recover,
  recoverWith,
  toResult,
} from './best-effort.js'
import type { BestEffort } from './best-effort.js'
import {
  parseWorld,
  parseWorldBestEffort,
  partition,
  readOpenWhen,
  World,
  WorldFormatErrors,
} from './consumer.js'
import type { Diagnostic, RawDocument } from './consumer.js'

const toErrors = (d: readonly Diagnostic[]) => new WorldFormatErrors(d)
const toList = (d: readonly unknown[]) => new ListError(d)
class ListError extends Error {
  constructor(readonly list: readonly unknown[]) {
    super('list')
  }
}
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
    expect(toResult(toErrors, bestEffort(1))).toBe(1)
    expect(toResult(toErrors)(bestEffort(1))).toBe(1)
    const failed = toResult(toList, bestEffort(1, ['a', 'b', 'a']))
    expect(failed).toBeInstanceOf(ListError)
    expect((failed as ListError).list).toEqual(['a', 'b', 'a'])
    expect(
      (toResult(toList)(bestEffort(1, ['a', 'b'])) as ListError).list,
    ).toEqual(['a', 'b'])
    for (const falsy of [undefined, null, 0, '', false]) {
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
})

const clean: RawDocument = {
  format: 'world-v2',
  id: 'w',
  boards: [
    { id: 'a', pieces: [{ id: 'p1', x: 0, y: 0 }], signals: ['s'] },
    { id: 'b', pieces: [] },
  ],
  stages: [{ id: 'st', board: 'b' }],
  links: [{ id: 'l1', from: 'a', to: 'b' }],
}
const leave = (doc: RawDocument) => {
  const parsed = parseWorldBestEffort(doc)
  if (isFailure(parsed)) throw parsed
  return parsed
}
const inert = (doc: RawDocument): readonly string[] => {
  const r = parseWorldBestEffort(doc)
  if (!(r instanceof WorldFormatErrors)) throw new Error('not inert')
  return r.errors.map((e) => e.message)
}

describe('the consumer on the kit', () => {
  it('the three-state reader: ok is a Just with no diagnostic, absent a Nothing with none, error a Nothing with one, and the lint a Just with one', () => {
    expect(readOpenWhen('s', 'a', ['s'], 3)).toEqual({
      value: 's',
      diagnostics: [],
    })
    expect(readOpenWhen(undefined, 'a', ['s'], 3)).toEqual({
      value: undefined,
      diagnostics: [],
    })
    expect(readOpenWhen(7, 'a', ['s'], 3)).toEqual({
      value: undefined,
      diagnostics: [{ message: 'open-when must be a string', line: 3 }],
    })
    expect(readOpenWhen('ghost', 'a', ['s'], 3)).toEqual({
      value: 'ghost',
      diagnostics: [
        {
          message: 'unknown signal "ghost"',
          line: 3,
          detail: { category: 'wiring', boardId: 'a' },
        },
      ],
    })
  })
  it('a clean document: strict and best effort agree, no diagnostics, toResult leaves as the World', () => {
    const strict = parseWorld(clean)
    expect(isSuccess(strict)).toBe(true)
    const be = leave(clean)
    expect(be.diagnostics).toEqual([])
    expect(be.value).toBeInstanceOf(World)
    expect(toResult(toErrors, be)).toBe(be.value)
  })
  it('a dangling Link: strict fails; best effort keeps the World, drops the Link, and the drop does not leave through toResult', () => {
    const doc = { ...clean, links: [{ id: 'l1', from: 'a', to: 'nowhere' }] }
    expect(isFailure(parseWorld(doc))).toBe(true)
    const be = leave(doc)
    expect(be.value.dto.links).toEqual([])
    const { dropped, diagnostics } = partition(be.diagnostics)
    expect(dropped.map((d) => [d.kind, d.id])).toEqual([['link', 'l1']])
    expect(diagnostics).toEqual([])
    expect(toResult(toErrors, be)).toBeInstanceOf(WorldFormatErrors)
  })
  it('a Piece on a taken cell: the Board is kept, the Piece is dropped with its raw DTO, and it appears in both projections', () => {
    const doc = {
      ...clean,
      boards: [
        {
          id: 'a',
          pieces: [
            { id: 'p1', x: 0, y: 0 },
            { id: 'p2', x: 0, y: 0 },
          ],
        },
      ],
      stages: [],
      links: [],
    }
    const be = leave(doc)
    expect(be.value.dto.boards[0].pieces.map((p) => p.id)).toEqual(['p1'])
    expect(be.diagnostics).toHaveLength(1)
    const { dropped, diagnostics } = partition(be.diagnostics)
    expect(dropped).toEqual([
      {
        kind: 'piece',
        id: 'p2',
        boardId: 'a',
        message: 'cell already taken by "p1"',
        line: 1,
        raw: { id: 'p2', x: 0, y: 0 },
      },
    ])
    expect(diagnostics).toEqual([
      {
        message: 'cell already taken by "p1"',
        line: 1,
        detail: { category: 'entity-local', boardId: 'a', pieceId: 'p2' },
      },
    ])
    expect(toResult(toErrors, be)).toBeInstanceOf(WorldFormatErrors)
  })
  it('a malformed Piece (Tier 1): excluded with a tagged diagnostic only, nothing to re-merge; a drop after it keeps its raw index', () => {
    const doc = {
      ...clean,
      boards: [
        {
          id: 'a',
          pieces: [
            { id: 'p1' },
            { id: 'p2', x: 0, y: 0 },
            { id: 'p3', x: 0, y: 0 },
          ],
        },
      ],
      stages: [],
      links: [],
    }
    const be = leave(doc)
    expect(be.value.dto.boards[0].pieces.map((p) => p.id)).toEqual(['p2'])
    const { dropped, diagnostics } = partition(be.diagnostics)
    expect(dropped.map((d) => [d.id, d.line])).toEqual([['p3', 2]])
    expect(diagnostics.map((d) => [d.message, d.line])).toEqual([
      ['piece #0 is malformed', 0],
      ['cell already taken by "p2"', 2],
    ])
  })
  it('a wiring lint modelled at the reader: the value is kept, the diagnostic is tagged, nothing is dropped', () => {
    const doc = {
      ...clean,
      boards: [
        {
          id: 'a',
          pieces: [{ id: 'p1', x: 0, y: 0, 'open-when': 'ghost' }],
          signals: ['s'],
        },
      ],
      stages: [],
      links: [],
    }
    const be = leave(doc)
    expect(be.value.dto.boards[0].pieces[0].openWhen).toBe('ghost')
    expect(partition(be.diagnostics)).toEqual({
      dropped: [],
      diagnostics: [
        {
          message: 'unknown signal "ghost"',
          line: 0,
          detail: { category: 'wiring', boardId: 'a' },
        },
      ],
    })
  })
  it("order: document order across boards; within a board, the piece readers' diagnostics, then the occupancy drops, each in document order; then the retry loop's drops in the order World.from names them", () => {
    const oneBoard = leave({
      ...clean,
      boards: [
        {
          id: 'a',
          pieces: [
            { id: 'p1', x: 0, y: 0 },
            { id: 'p2', x: 0, y: 0 },
            { id: 'p3', x: 1, y: 1, 'open-when': 'ghost' },
          ],
        },
      ],
      stages: [],
      links: [],
    })
    expect(
      oneBoard.diagnostics.map((d) =>
        'kind' in d ? `${d.kind}:${d.id}@${d.line}` : `${d.message}@${d.line}`,
      ),
    ).toEqual(['unknown signal "ghost"@2', 'piece:p2@1'])
    const doc: RawDocument = {
      format: 'world-v2',
      id: 'w',
      boards: [
        { id: 'a', pieces: [{ id: 'p1', x: 0, y: 0, 'open-when': 'ghost' }] },
        {
          id: 'b',
          pieces: [
            { id: 'q1', x: 1, y: 1 },
            { id: 'q2', x: 1, y: 1 },
          ],
        },
      ],
      stages: [{ id: 'st', board: 'nowhere' }],
      links: [{ id: 'l1', from: 'a', to: 'nowhere' }],
    }
    const be = leave(doc)
    expect(
      be.diagnostics.map((d) =>
        'kind' in d ? `${d.kind}:${d.id}` : d.message,
      ),
    ).toEqual(['unknown signal "ghost"', 'piece:q2', 'stage:st', 'link:l1'])
    expect(be.value.dto.stages).toEqual([])
    expect(be.value.dto.links).toEqual([])
  })
  it('the pinned policy: an untagged shape failure, a missing world id, an unattributable rejection or an exhausted budget is the strict Failure, with its messages', () => {
    expect(inert({ ...clean, boards: [{ pieces: [] }] })).toEqual([
      'Board #1 must have an id',
    ])
    expect(inert({ ...clean, id: undefined })).toEqual([
      'World is missing required key "id"',
    ])
    const duplicate = {
      ...clean,
      boards: [
        { id: 'a', pieces: [] },
        { id: 'a', pieces: [] },
      ],
      stages: [],
      links: [],
    }
    expect(inert(duplicate)).toEqual(['duplicate id "a"'])
    const links = Array.from({ length: 65 }, (_, i) => ({
      id: `l${i}`,
      from: 'a',
      to: 'nowhere',
    }))
    expect(inert({ ...clean, links })).toEqual(['link "l0" dangles'])
    expect(
      isSuccess(parseWorldBestEffort({ ...clean, links: links.slice(0, 64) })),
    ).toBe(true)
  })
  it('a dangling Link that shares its id with a valid Link: only the dangling entry is dropped, by identity', () => {
    const valid = { id: 'l1', from: 'a', to: 'b' }
    const dangling = { id: 'l1', from: 'a', to: 'nowhere' }
    const be = leave({ ...clean, links: [valid, dangling] })
    expect(be.value.dto.links).toEqual([valid])
    const { dropped } = partition(be.diagnostics)
    expect(dropped).toHaveLength(1)
    expect(dropped[0].raw).toBe(dangling)
  })
  it("the format gate: a diagnostic of the prelude, first in the list ahead of the readers' diagnostics, blocking in the port (the consumer reads past it)", () => {
    expect(inert({ ...clean, format: undefined, id: undefined })).toEqual([
      'format must be world-v2',
      'World is missing required key "id"',
    ])
    const withLint = {
      ...clean,
      format: undefined,
      boards: [
        {
          id: 'a',
          pieces: [{ id: 'p1', x: 0, y: 0, 'open-when': 'ghost' }],
          signals: ['s'],
        },
      ],
    }
    expect(inert(withLint)).toEqual([
      'format must be world-v2',
      'unknown signal "ghost"',
    ])
  })
})
