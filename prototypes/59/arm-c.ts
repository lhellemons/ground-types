/* PROTOTYPE #59 — throwaway. Arm C: `gen` over a generator body in which
   `yield* take(part)` unboxes a part or leaves with its Failure. Nothing is
   caught. A `yield*` cannot sit inside a nested callback, so the list in
   `Slide.from` is a loop; `Slide.fromWithCollect` shows the A+C spelling.
   No return type is annotated, so the probes measure what TypeScript
   infers on its own. */
import { failure } from '../../src/result/index.js'
import type { Maybe } from '../../src/maybe/index.js'
import { collect, gen, take } from './fan-in.js'
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

  static from(dto: PositionDTO) {
    return gen(function* () {
      const x = yield* take(coordinateOf(dto.x))
      const y = yield* take(coordinateOf(dto.y))
      const key = `${x},${y}`
      let position = Position.registry.get(key)
      if (position === undefined) {
        position = new Position(key, x, y)
        Position.registry.set(key, position)
      }
      return position
    })
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

  /* The factory's own failures leave through `yield* take(failure(...))`;
     a plain `return failure(...)` would land in `T`, not in `E`. */
  static from(dto: DoorDTO) {
    return gen(function* () {
      if ((dto.kind as string) !== 'door')
        yield* take(
          failure(new WrongKind(`Expected a Door, got kind "${dto.kind}"`)),
        )
      const id = yield* take(PieceId.from(dto.id))
      const at = yield* take(Position.from(dto.at))
      const openWhenText = dto['open-when']
      const unlockWithDto = dto['unlock-with']
      if (openWhenText !== undefined && unlockWithDto !== undefined)
        yield* take(
          failure(
            new BothGateForms(`Door "${dto.id}" authors both gate forms`),
          ),
        )
      const openWhen =
        openWhenText === undefined
          ? undefined
          : yield* take(parseOpenWhen(openWhenText))
      const unlockWith: UnlockWith | undefined =
        unlockWithDto === undefined
          ? undefined
          : {
              group: yield* take(CollectibleGroup.from(unlockWithDto.group)),
              count: yield* take(UnlockCount.from(unlockWithDto.count)),
            }
      return new Door(id, at, openWhen, unlockWith, dto.persistent ?? false)
    })
  }
}

export class Slide {
  private constructor(
    readonly direction: Direction,
    readonly terminal: TerminalEvent,
    readonly path: readonly Position[],
    readonly pieceId: Maybe<PieceId>,
  ) {}

  static from(dto: SlideDTO) {
    return gen(function* () {
      const direction = yield* take(Direction.from(dto.direction))
      const terminal = yield* take(TerminalEvent.from(dto.terminal))
      if (dto.path.length === 0)
        yield* take(
          failure(new EmptyPath('A Slide traverses at least one cell')),
        )
      const path: Position[] = []
      for (const p of dto.path) path.push(yield* take(Position.from(p)))
      const pieceId =
        dto.pieceId === undefined
          ? undefined
          : yield* take(PieceId.from(dto.pieceId))
      if (pieceId !== undefined && terminal !== 'stopped-by-obstacle')
        yield* take(
          failure(
            new IdWithoutTerminal(
              `pieceId is only meaningful for "stopped-by-obstacle", got "${terminal}"`,
            ),
          ),
        )
      return new Slide(direction, terminal, path, pieceId)
    })
  }

  /* A + C: `collect` for the list and the optional part, `yield*` for the
     dependent steps. */
  static fromWithCollect(dto: SlideDTO) {
    return gen(function* () {
      if (dto.path.length === 0)
        yield* take(
          failure(new EmptyPath('A Slide traverses at least one cell')),
        )
      const { direction, terminal, path } = yield* take(
        collect({
          direction: Direction.from(dto.direction),
          terminal: TerminalEvent.from(dto.terminal),
          path: collect(dto.path.map((p) => Position.from(p))),
        }),
      )
      const pieceId =
        dto.pieceId === undefined
          ? undefined
          : yield* take(PieceId.from(dto.pieceId))
      if (pieceId !== undefined && terminal !== 'stopped-by-obstacle')
        yield* take(
          failure(
            new IdWithoutTerminal(
              `pieceId is only meaningful for "stopped-by-obstacle", got "${terminal}"`,
            ),
          ),
        )
      return new Slide(direction, terminal, path, pieceId)
    })
  }
}
