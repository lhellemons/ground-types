/* PROTOTYPE #117 — throwaway runtime probes: the consumer's documents through
   the port, the two projections, the order of diagnostics, and what
   leaves through toResult. Named outside vitest's default pattern so the
   root suite never runs it. */
import { describe, expect, it } from 'vitest'
import {
  failure,
  isFailure,
  isSuccess,
  success,
} from '../../src/result/index.js'
import {
  andThen,
  bestEffort,
  gather,
  map,
  note,
  recover,
  toResult,
} from './best-effort.js'
import {
  parseWorld,
  parseWorldBestEffort,
  partition,
  World,
  WorldFormatErrors,
} from './consumer.js'
import type { Diagnostic, RawDocument } from './consumer.js'

const toErrors = (d: readonly Diagnostic[]) => new WorldFormatErrors(d)
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

describe('the kit', () => {
  it('andThen keeps diagnostics in order: first step, then second', () => {
    const be = andThen(
      (x: number) => bestEffort(x + 1, ['second']),
      bestEffort(1, ['first']),
    )
    expect(be).toEqual({ value: 2, diagnostics: ['first', 'second'] })
  })
  it('map keeps diagnostics, note appends, gather flattens in part order', () => {
    expect(map((x: number) => x * 2, bestEffort(1, ['d']))).toEqual({
      value: 2,
      diagnostics: ['d'],
    })
    expect(note(['e'], bestEffort(1, ['d']))).toEqual({
      value: 1,
      diagnostics: ['d', 'e'],
    })
    expect(
      gather([bestEffort(1, ['a']), bestEffort(2), bestEffort(3, ['c'])]),
    ).toEqual({
      value: [1, 2, 3],
      diagnostics: ['a', 'c'],
    })
  })
  it('recover: a Success is itself with no diagnostic; a Failure is the fallback with the error, or what diagnose makes of it', () => {
    const err = new RangeError('bad')
    expect(recover(success(1), 0)).toEqual({ value: 1, diagnostics: [] })
    expect(recover(failure(err), 0)).toEqual({ value: 0, diagnostics: [err] })
    expect(recover(failure(err), 0, (e) => e.message)).toEqual({
      value: 0,
      diagnostics: ['bad'],
    })
  })
  it('toResult: a Success when no diagnostic exists, else a Failure of toError(diagnostics)', () => {
    expect(toResult(toErrors, bestEffort(1))).toBe(1)
    const failed = toResult(toErrors, bestEffort(1, [{ message: 'm' }]))
    expect(failed).toBeInstanceOf(WorldFormatErrors)
    expect((failed as WorldFormatErrors).errors).toEqual([{ message: 'm' }])
  })
  it('a BestEffort is frozen, its diagnostics copied', () => {
    const diagnostics = ['d']
    const be = bestEffort(1, diagnostics)
    diagnostics.push('later')
    expect(be.diagnostics).toEqual(['d'])
    expect(Object.isFrozen(be)).toBe(true)
    expect(Object.isFrozen(be.diagnostics)).toBe(true)
  })
})

describe('the consumer on the kit', () => {
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
  it('a malformed Piece (Tier 1): excluded with a tagged diagnostic only, nothing to re-merge', () => {
    const doc = {
      ...clean,
      boards: [{ id: 'a', pieces: [{ id: 'p1' }] }],
      stages: [],
      links: [],
    }
    const be = leave(doc)
    expect(be.value.dto.boards[0].pieces).toEqual([])
    expect(partition(be.diagnostics)).toEqual({
      dropped: [],
      diagnostics: [
        {
          message: 'piece #0 is malformed',
          line: 0,
          detail: { category: 'entity-local', boardId: 'a', pieceId: 'p1' },
        },
      ],
    })
  })
  it('a wiring lint: the value is kept, the diagnostic is tagged, nothing is dropped; the three-state reader reads ok-with-diagnostic', () => {
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
  it('order: document order for the readers, then the retry loop drops in the order World.from names them', () => {
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
  it('the pinned policy: an untagged shape problem, a missing world id, an unattributable rejection or an exhausted budget is the strict Failure', () => {
    const noBoardId = { ...clean, boards: [{ pieces: [] }] }
    const r1 = parseWorldBestEffort(noBoardId)
    expect(r1).toBeInstanceOf(WorldFormatErrors)
    expect((r1 as WorldFormatErrors).errors.map((e) => e.message)).toEqual([
      'Board #1 must have an id',
    ])
    expect(parseWorldBestEffort({ ...clean, id: undefined })).toBeInstanceOf(
      WorldFormatErrors,
    )
    const duplicate = {
      ...clean,
      boards: [
        { id: 'a', pieces: [] },
        { id: 'a', pieces: [] },
      ],
      stages: [],
      links: [],
    }
    expect(parseWorldBestEffort(duplicate)).toBeInstanceOf(WorldFormatErrors)
    const links = Array.from({ length: 65 }, (_, i) => ({
      id: `l${i}`,
      from: 'a',
      to: 'nowhere',
    }))
    expect(parseWorldBestEffort({ ...clean, links })).toBeInstanceOf(
      WorldFormatErrors,
    )
    expect(
      isSuccess(parseWorldBestEffort({ ...clean, links: links.slice(0, 64) })),
    ).toBe(true)
  })
  it('the format gate: a diagnostic of the prelude, blocking in the port (the consumer reads past it)', () => {
    const r = parseWorldBestEffort({ ...clean, format: undefined })
    expect(r).toBeInstanceOf(WorldFormatErrors)
    expect((r as WorldFormatErrors).errors.map((e) => e.message)).toEqual([
      'format must be world-v2',
    ])
  })
})
