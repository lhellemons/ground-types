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

describe('the kit', () => {
  it('bestEffort copies and freezes: a later push to the source list is not seen, the box and its list are frozen', () => {
    const diagnostics = ['d']
    const be = bestEffort(1, diagnostics)
    diagnostics.push('later')
    expect(be.diagnostics).toEqual(['d'])
    expect(frozen(be)).toBe(true)
  })
  it('andThen: the first step’s diagnostics, then the second’s, both in order, duplicates kept; applied and curried alike; frozen', () => {
    const second = (x: number) => bestEffort(x + 1, ['c', 'd', 'c'])
    const expected = { value: 2, diagnostics: ['a', 'b', 'c', 'd', 'c'] }
    const applied = andThen(second, bestEffort(1, ['a', 'b']))
    expect(applied).toEqual(expected)
    expect(andThen(second)(bestEffort(1, ['a', 'b']))).toEqual(expected)
    expect(frozen(applied)).toBe(true)
  })
  it('map keeps the diagnostics in order; applied and curried alike; frozen', () => {
    const expected = { value: 2, diagnostics: ['a', 'b', 'a'] }
    const applied = map((x: number) => x * 2, bestEffort(1, ['a', 'b', 'a']))
    expect(applied).toEqual(expected)
    expect(map((x: number) => x * 2)(bestEffort(1, ['a', 'b', 'a']))).toEqual(
      expected,
    )
    expect(frozen(applied)).toBe(true)
  })
  it('note appends after the ones held, in its own order, duplicates kept; applied and curried alike; frozen', () => {
    const expected = { value: 1, diagnostics: ['a', 'b', 'c', 'd', 'c'] }
    const applied = note(['c', 'd', 'c'], bestEffort(1, ['a', 'b']))
    expect(applied).toEqual(expected)
    expect(note(['c', 'd', 'c'])(bestEffort(1, ['a', 'b']))).toEqual(expected)
    expect(frozen(applied)).toBe(true)
  })
  it('gather: values in part order, diagnostics in part order and within a part, duplicates kept, an empty list gives an empty box; frozen', () => {
    const g = gather([
      bestEffort(1, ['a', 'b']),
      bestEffort(2),
      bestEffort(3, ['b', 'a']),
    ])
    expect(g).toEqual({ value: [1, 2, 3], diagnostics: ['a', 'b', 'b', 'a'] })
    expect(gather([])).toEqual({ value: [], diagnostics: [] })
    expect(frozen(g)).toBe(true)
  })
  it('recover: a Success is itself with no diagnostic, success(undefined) and success(null) included; a Failure is the fallback with the error; applied and curried alike', () => {
    const err = new RangeError('bad')
    expect(recover(0, success(1))).toEqual({ value: 1, diagnostics: [] })
    expect(recover(0)(success(1))).toEqual({ value: 1, diagnostics: [] })
    const ofUndefined = success(undefined) as Result<string | undefined, Error>
    expect(recover<string | undefined, Error>('fb', ofUndefined)).toEqual({
      value: undefined,
      diagnostics: [],
    })
    const ofNull = success(null) as Result<string | null, Error>
    expect(recover<string | null, Error>('fb', ofNull)).toEqual({
      value: null,
      diagnostics: [],
    })
    expect(recover(0, failure(err))).toEqual({ value: 0, diagnostics: [err] })
    expect(recover(0)(failure(err))).toEqual({ value: 0, diagnostics: [err] })
    expect(frozen(recover(0, failure(err)))).toBe(true)
  })
  it('recoverWith: diagnose(error) is the one diagnostic on a Failure and is not called on a Success; a throw from diagnose propagates, Error or not; applied and curried alike', () => {
    const err = new RangeError('bad')
    let calls = 0
    const diagnose = (e: RangeError) => {
      calls++
      return e.message
    }
    expect(recoverWith(0, diagnose, failure(err))).toEqual({
      value: 0,
      diagnostics: ['bad'],
    })
    expect(recoverWith(0, diagnose)(failure(err))).toEqual({
      value: 0,
      diagnostics: ['bad'],
    })
    expect(recoverWith(0, diagnose, success(1))).toEqual({
      value: 1,
      diagnostics: [],
    })
    expect(calls).toBe(2)
    const thrown = new TypeError('from diagnose')
    expect(() =>
      recoverWith(
        0,
        () => {
          throw thrown
        },
        failure(err),
      ),
    ).toThrow(thrown)
    expect(() =>
      recoverWith(
        0,
        () => {
          throw 'plain'
        },
        failure(err),
      ),
    ).toThrow('plain')
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
      const r = toResult(toList, bestEffort(1, [falsy]))
      expect(r).toBeInstanceOf(ListError)
      expect((r as ListError).list).toEqual([falsy])
    }
  })
  it('toResult: a throw from toError propagates, Error or not, and toError is not called on an empty list', () => {
    const thrown = new TypeError('from toError')
    expect(() =>
      toResult(
        () => {
          throw thrown
        },
        bestEffort(1, ['d']),
      ),
    ).toThrow(thrown)
    expect(() =>
      toResult(
        () => {
          throw 'plain'
        },
        bestEffort(1, ['d']),
      ),
    ).toThrow('plain')
    expect(
      toResult(() => {
        throw thrown
      }, bestEffort(1)),
    ).toBe(1)
  })
  it('a plain object literal is a BestEffort structurally and is not frozen by being one', () => {
    const literal: BestEffort<number, string> = { value: 1, diagnostics: ['d'] }
    expect(Object.isFrozen(literal)).toBe(false)
    expect(toResult(toList, literal)).toBeInstanceOf(ListError)
    expect(frozen(map((x: number) => x, literal))).toBe(true)
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
  it('order: document order for the readers, then the retry loop’s drops in the order World.from names them', () => {
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
  it('the pinned policy: an untagged shape problem, a missing world id, an unattributable rejection or an exhausted budget is the strict Failure, with its messages', () => {
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
  it('the format gate: a diagnostic of the prelude, first in the list, blocking in the port (the consumer reads past it)', () => {
    expect(inert({ ...clean, format: undefined, id: undefined })).toEqual([
      'format must be world-v2',
      'World is missing required key "id"',
    ])
  })
})
