/* PROTOTYPE #59 — throwaway. Arm A: `collect` over the parts, then
   `map`/`andThen` (or an early return) for the construction step. Nothing
   is caught; a bug in a part throws out of the argument list before
   `collect` runs. No return type is annotated, so the probes measure what
   TypeScript infers on its own. */
import {
  andThen,
  failure,
  isFailure,
  map,
  success,
} from '../../src/result/index.js'
import { map as mapMaybe } from '../../src/maybe/index.js'
import type { Maybe } from '../../src/maybe/index.js'
import { collect, collectAll } from './fan-in.js'
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

  /* The key depends on both coordinates, so the parts come first and the
     construction follows: here as an early return, as consumers write. */
  static from(dto: PositionDTO) {
    const parts = collect({ x: coordinateOf(dto.x), y: coordinateOf(dto.y) })
    if (isFailure(parts)) return failure(parts)
    const { x, y } = parts
    const key = `${x},${y}`
    let position = Position.registry.get(key)
    if (position === undefined) {
      position = new Position(key, x, y)
      Position.registry.set(key, position)
    }
    return success(position)
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

  /* The two preconditions read the DTO, not the parts, so they stay early
     returns ahead of the fan-in. An optional part is a Maybe of a Result,
     which the unboxed encoding reads as a Result of a Maybe; a nested
     object of parts is a nested `collect`. */
  static from(dto: DoorDTO) {
    if ((dto.kind as string) !== 'door')
      return failure(new WrongKind(`Expected a Door, got kind "${dto.kind}"`))
    const openWhenText = dto['open-when']
    const unlockWithDto = dto['unlock-with']
    if (openWhenText !== undefined && unlockWithDto !== undefined)
      return failure(
        new BothGateForms(`Door "${dto.id}" authors both gate forms`),
      )
    return map(
      ({ id, at, openWhen, unlockWith }) =>
        new Door(id, at, openWhen, unlockWith, dto.persistent ?? false),
      collect({
        id: PieceId.from(dto.id),
        at: Position.from(dto.at),
        openWhen: mapMaybe(parseOpenWhen, openWhenText),
        unlockWith: mapMaybe(
          (u) =>
            collect({
              group: CollectibleGroup.from(u.group),
              count: UnlockCount.from(u.count),
            }),
          unlockWithDto,
        ),
      }),
    )
  }

  /* The accumulating variant: every failed part at once, as `Failures`. A
     nested object of parts accumulates too, which nests a `Failures` inside the
     outer one. The error union is `Failures<DoorError>` minus the two
     preconditions. */
  static fromAll(dto: DoorDTO) {
    if ((dto.kind as string) !== 'door')
      return failure(new WrongKind(`Expected a Door, got kind "${dto.kind}"`))
    const openWhenText = dto['open-when']
    const unlockWithDto = dto['unlock-with']
    if (openWhenText !== undefined && unlockWithDto !== undefined)
      return failure(
        new BothGateForms(`Door "${dto.id}" authors both gate forms`),
      )
    return map(
      ({ id, at, openWhen, unlockWith }) =>
        new Door(id, at, openWhen, unlockWith, dto.persistent ?? false),
      collectAll({
        id: PieceId.from(dto.id),
        at: Position.from(dto.at),
        openWhen: mapMaybe(parseOpenWhen, openWhenText),
        unlockWith: mapMaybe(
          (u) =>
            collectAll({
              group: CollectibleGroup.from(u.group),
              count: UnlockCount.from(u.count),
            }),
          unlockWithDto,
        ),
      }),
    )
  }
}

export class Slide {
  private constructor(
    readonly direction: Direction,
    readonly terminal: TerminalEvent,
    readonly path: readonly Position[],
    readonly pieceId: Maybe<PieceId>,
  ) {}

  /* The pieceId/terminal check needs two built parts, so the construction
     step can fail: `andThen` instead of `map`. The list is `collect` over a
     plain `.map`. */
  static from(dto: SlideDTO) {
    if (dto.path.length === 0)
      return failure(new EmptyPath('A Slide traverses at least one cell'))
    return andThen(
      ({ direction, terminal, path, pieceId }) => {
        if (pieceId !== undefined && terminal !== 'stopped-by-obstacle')
          return failure(
            new IdWithoutTerminal(
              `pieceId is only meaningful for "stopped-by-obstacle", got "${terminal}"`,
            ),
          )
        return success(new Slide(direction, terminal, path, pieceId))
      },
      collect({
        direction: Direction.from(dto.direction),
        terminal: TerminalEvent.from(dto.terminal),
        path: collect(dto.path.map((p) => Position.from(p))),
        pieceId: mapMaybe((id) => PieceId.from(id), dto.pieceId),
      }),
    )
  }
}
