/* PROTOTYPE #59 — throwaway. The three factories as slider writes them
   today: `tryCatch` around a body that `assertSuccess`es every part. The
   return type is `Result<X, Error>` because that is all `tryCatch` can say,
   and a bug inside the body is caught along with the parts' failures. */
import { assertSuccess, tryCatch } from '../../src/result/index.js'
import type { Result } from '../../src/result/index.js'
import { map } from '../../src/maybe/index.js'
import type { Maybe } from '../../src/maybe/index.js'
import {
  BothGateForms,
  CollectibleGroup,
  Direction,
  EmptyPath,
  IdWithoutTerminal,
  PieceId,
  TerminalEvent,
  UnlockCount,
  WrongKind,
  coordinateOf,
  parseOpenWhen,
} from './slider.js'
import type {
  Coordinate,
  DoorDTO,
  OpenWhenExpr,
  PositionDTO,
  SlideDTO,
} from './slider.js'

export class Position {
  private static readonly registry = new Map<string, Position>()
  private constructor(
    readonly key: string,
    readonly x: Coordinate,
    readonly y: Coordinate,
  ) {}

  static from(dto: PositionDTO): Result<Position, Error> {
    return tryCatch((dto: PositionDTO) => {
      const x = assertSuccess(coordinateOf(dto.x))
      const y = assertSuccess(coordinateOf(dto.y))
      const key = `${x},${y}`
      let position = Position.registry.get(key)
      if (position === undefined) {
        position = new Position(key, x, y)
        Position.registry.set(key, position)
      }
      return position
    })(dto)
  }
}

export type UnlockWith = {
  readonly group: CollectibleGroup
  readonly count: UnlockCount
}

export class Door {
  private constructor(
    readonly id: PieceId,
    readonly at: Position,
    readonly openWhen: OpenWhenExpr | undefined,
    readonly unlockWith: UnlockWith | undefined,
    readonly persistent: boolean,
  ) {}

  static from(dto: DoorDTO): Result<Door, Error> {
    return tryCatch((dto: DoorDTO) => {
      if ((dto.kind as string) !== 'door')
        throw new WrongKind(`Expected a Door, got kind "${dto.kind}"`)
      const id = assertSuccess(PieceId.from(dto.id))
      const at = assertSuccess(Position.from(dto.at))
      const openWhenText = dto['open-when']
      const unlockWithDto = dto['unlock-with']
      if (openWhenText !== undefined && unlockWithDto !== undefined)
        throw new BothGateForms(`Door "${dto.id}" authors both gate forms`)
      const openWhen =
        openWhenText === undefined
          ? undefined
          : assertSuccess(parseOpenWhen(openWhenText))
      const unlockWith: UnlockWith | undefined =
        unlockWithDto === undefined
          ? undefined
          : {
              group: assertSuccess(CollectibleGroup.from(unlockWithDto.group)),
              count: assertSuccess(UnlockCount.from(unlockWithDto.count)),
            }
      return new Door(id, at, openWhen, unlockWith, dto.persistent ?? false)
    })(dto)
  }
}

export class Slide {
  private constructor(
    readonly direction: Direction,
    readonly terminal: TerminalEvent,
    readonly path: readonly Position[],
    readonly pieceId: Maybe<PieceId>,
  ) {}

  static from(dto: SlideDTO): Result<Slide, Error> {
    return tryCatch((dto: SlideDTO) => {
      const direction = assertSuccess(Direction.from(dto.direction))
      const terminal = assertSuccess(TerminalEvent.from(dto.terminal))
      if (dto.path.length === 0)
        throw new EmptyPath('A Slide traverses at least one cell')
      const path = dto.path.map((p) => assertSuccess(Position.from(p)))
      const pieceId = map(
        (id: string) => assertSuccess(PieceId.from(id)),
        dto.pieceId,
      )
      if (pieceId !== undefined && terminal !== 'stopped-by-obstacle')
        throw new IdWithoutTerminal(
          `pieceId is only meaningful for "stopped-by-obstacle", got "${terminal}"`,
        )
      return new Slide(direction, terminal, path, pieceId)
    })(dto)
  }
}
