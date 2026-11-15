/* PROTOTYPE #59 — throwaway runtime probes: the same DTOs through every
   arm, the failure each returns, and what happens to a bug. */
import { afterEach, describe, expect, it } from 'vitest'
import { failure, isFailure, isSuccess } from '../../src/result/index.js'
import type { Result } from '../../src/result/index.js'
import { attempt, collect, collectAll, Failures, gen, take } from './fan-in.js'
import type { Take } from './fan-in.js'
import {
  BothGateForms,
  Coordinate,
  EmptyPath,
  IdWithoutTerminal,
  InvalidCoordinate,
  InvalidPieceId,
  InvalidUnlockCount,
  OpenWhenSyntaxError,
  PieceId,
  plantBug,
} from './slider.js'
import type { DoorDTO, SlideDTO } from './slider.js'
import * as Current from './current.js'
import * as A from './arm-a.js'
import * as B from './arm-b.js'
import * as C from './arm-c.js'

const arms = [
  ['current', Current],
  ['A', A],
  ['B', B],
  ['C', C],
] as const

const door: DoorDTO = {
  kind: 'door',
  id: 'd1',
  at: { x: 1, y: 2 },
  'unlock-with': { group: 'keys', count: 2 },
}
const slide: SlideDTO = {
  direction: 'up',
  terminal: 'stopped-by-obstacle',
  path: [
    { x: 1, y: 2 },
    { x: 1, y: 1 },
  ],
  pieceId: 'p1',
}

afterEach(() => plantBug(undefined))

describe.each(arms)('%s', (_name, arm) => {
  it('builds the Door and the Slide from a valid DTO', () => {
    const d = arm.Door.from(door)
    expect(isSuccess(d)).toBe(true)
    if (isSuccess(d)) {
      expect(d.id).toBe('d1')
      expect(d.at.key).toBe('1,2')
      expect(d.unlockWith).toEqual({ group: 'keys', count: 2 })
      expect(d.openWhen).toBeUndefined()
    }
    const s = arm.Slide.from(slide)
    expect(isSuccess(s)).toBe(true)
    if (isSuccess(s)) {
      expect(s.path.map((p: { key: string }) => p.key)).toEqual(['1,2', '1,1'])
      expect(s.pieceId).toBe('p1')
    }
  })

  it('returns the first failed part, as the instance the part produced', () => {
    const d = arm.Door.from({ ...door, id: 'BAD', at: { x: -1, y: 0 } })
    expect(d).toBeInstanceOf(InvalidPieceId)
    const s = arm.Slide.from({
      ...slide,
      path: [
        { x: 0, y: 0 },
        { x: -1, y: 0 },
      ],
    })
    expect(s).toBeInstanceOf(InvalidCoordinate)
  })

  it("returns the factory's own failures", () => {
    expect(arm.Door.from({ ...door, 'open-when': 'x' })).toBeInstanceOf(
      BothGateForms,
    )
    expect(
      arm.Door.from({ ...door, 'unlock-with': { group: 'keys', count: 0 } }),
    ).toBeInstanceOf(InvalidUnlockCount)
    expect(
      arm.Door.from({ ...door, 'unlock-with': undefined, 'open-when': 'a b' }),
    ).toBeInstanceOf(OpenWhenSyntaxError)
    expect(arm.Slide.from({ ...slide, path: [] })).toBeInstanceOf(EmptyPath)
  })

  it('a dependent step: pieceId needs the built terminal', () => {
    expect(arm.Slide.from({ ...slide, terminal: 'fell-off' })).toBeInstanceOf(
      IdWithoutTerminal,
    )
    expect(
      isSuccess(
        arm.Slide.from({ ...slide, terminal: 'fell-off', pieceId: undefined }),
      ),
    ).toBe(true)
  })
})

describe('a bug inside a part', () => {
  it('slider today: the bug becomes a Failure', () => {
    plantBug(() => {
      throw new TypeError('bug')
    })
    const r = Current.Position.from({ x: 1, y: 1 })
    expect(r).toBeInstanceOf(TypeError)
  })

  it.each([
    ['A', A],
    ['B', B],
    ['C', C],
  ] as const)('%s: the bug propagates', (_name, arm) => {
    plantBug(() => {
      throw new TypeError('bug')
    })
    expect(() => arm.Position.from({ x: 1, y: 1 })).toThrow(TypeError)
    plantBug(() => {
      throw 'not even an Error'
    })
    expect(() => arm.Position.from({ x: 1, y: 1 })).toThrow('not even an Error')
  })
})

describe('A. collect', () => {
  it('returns its argument on success, so nothing is allocated', () => {
    const parts = { id: PieceId.from('a'), x: Coordinate.from(1) }
    expect(collect(parts)).toBe(parts)
    const list = [PieceId.from('a'), PieceId.from('b')]
    expect(collect(list)).toBe(list)
  })

  it('accumulates every failed part, in part order, nested for a nested struct', () => {
    const r = collectAll({
      id: PieceId.from('BAD'),
      x: Coordinate.from(-1),
      y: Coordinate.from(2),
    })
    expect(r).toBeInstanceOf(Failures)
    expect(r).toBeInstanceOf(AggregateError)
    if (isFailure(r)) {
      expect(r.errors.map((e) => e.code)).toEqual([
        'invalid-piece-id',
        'invalid-coordinate',
      ])
    }
    const d = A.Door.fromAll({
      ...door,
      id: 'BAD',
      'unlock-with': { group: 'K', count: 0 },
    })
    expect(d).toBeInstanceOf(Failures)
    const outer = d as Failures<Error | Failures<{ code: string } & Error>>
    expect(outer.errors).toHaveLength(2)
    expect(outer.errors[0]).toBeInstanceOf(InvalidPieceId)
    expect(outer.errors[1]).toBeInstanceOf(Failures)
    expect(
      (outer.errors[1] as Failures<{ code: string } & Error>).errors.map(
        (e) => e.code,
      ),
    ).toEqual(['invalid-collectible-group', 'invalid-unlock-count'])
  })
})

describe('B. attempt/take', () => {
  it("a take from another attempt is not this attempt's leave: it propagates", () => {
    let foreign: Take<InvalidPieceId> | undefined
    attempt((take) => {
      foreign = take
      return 0
    })
    const run = (): Result<number, InvalidPieceId> =>
      attempt(() => {
        foreign!(PieceId.from('BAD'))
        return 1
      })
    let thrown: unknown
    try {
      run()
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeDefined()
    expect(thrown).not.toBeInstanceOf(Error)
  })

  it('a take inside a .map callback and a Maybe map callback leaves the attempt', () => {
    const r = attempt<PieceId[], InvalidPieceId>((take) =>
      ['a', 'BAD', 'c'].map((s) => take(PieceId.from(s))),
    )
    expect(r).toBeInstanceOf(InvalidPieceId)
  })
})

describe('C. gen / yield* take', () => {
  it('runs finally blocks on a failure, through return()', () => {
    let ran = false
    const r = gen(function* () {
      try {
        yield* take(failure(new InvalidPieceId('x')))
        return 1
      } finally {
        ran = true
      }
    })
    expect(r).toBeInstanceOf(InvalidPieceId)
    expect(ran).toBe(true)
  })

  it('stops at the first failure: later parts are not evaluated', () => {
    let later = 0
    gen(function* () {
      const a = yield* take(PieceId.from('BAD'))
      later += 1
      const b = yield* take(PieceId.from('b'))
      return [a, b]
    })
    expect(later).toBe(0)
  })
})
