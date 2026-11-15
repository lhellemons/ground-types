/* PROTOTYPE #59 — throwaway. Arm B: `attempt` with a `take` that leaves on
   the first Failure through a private token. This is slider's shape with
   `assertSuccess` renamed, so the bodies are near-verbatim ports of
   current.ts. `E` has no inference site in the body: the return annotation
   on each factory is where TypeScript may find it (the probes measure
   whether it does), so unlike arm A every factory here is annotated. */
import { failure } from '../../src/result/index.js'
import type { Result } from '../../src/result/index.js'
import { map } from '../../src/maybe/index.js'
import type { Maybe } from '../../src/maybe/index.js'
import { attempt } from './fan-in.js'
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
  DoorError,
  OpenWhenExpr,
  PositionDTO,
  PositionError,
  SlideDTO,
  SlideError,
} from './slider.js'

export class Position {
  private static readonly registry = new Map<string, Position>()
  private constructor(
    readonly key: string,
    readonly x: Coordinate,
    readonly y: Coordinate,
  ) {}

  static from(dto: PositionDTO): Result<Position, PositionError> {
    return attempt((take) => {
      const x = take(coordinateOf(dto.x))
      const y = take(coordinateOf(dto.y))
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

  /* The factory's own failures cannot be thrown (nothing but the token is
     caught), so they are early returns ahead of the attempt, or a
     `take(failure(...))` inside it. Both are shown. */
  static from(dto: DoorDTO): Result<Door, DoorError> {
    if ((dto.kind as string) !== 'door')
      return failure(new WrongKind(`Expected a Door, got kind "${dto.kind}"`))
    return attempt((take) => {
      const id = take(PieceId.from(dto.id))
      const at = take(Position.from(dto.at))
      const openWhenText = dto['open-when']
      const unlockWithDto = dto['unlock-with']
      if (openWhenText !== undefined && unlockWithDto !== undefined)
        take(
          failure(
            new BothGateForms(`Door "${dto.id}" authors both gate forms`),
          ),
        )
      const openWhen =
        openWhenText === undefined
          ? undefined
          : take(parseOpenWhen(openWhenText))
      const unlockWith: UnlockWith | undefined =
        unlockWithDto === undefined
          ? undefined
          : {
              group: take(CollectibleGroup.from(unlockWithDto.group)),
              count: take(UnlockCount.from(unlockWithDto.count)),
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

  /* `take` works inside `.map` and inside the Maybe `map` callback, since
     it leaves by throwing. */
  static from(dto: SlideDTO): Result<Slide, SlideError> {
    return attempt((take) => {
      const direction = take(Direction.from(dto.direction))
      const terminal = take(TerminalEvent.from(dto.terminal))
      if (dto.path.length === 0)
        take(failure(new EmptyPath('A Slide traverses at least one cell')))
      const path = dto.path.map((p) => take(Position.from(p)))
      const pieceId = map((id: string) => take(PieceId.from(id)), dto.pieceId)
      if (pieceId !== undefined && terminal !== 'stopped-by-obstacle')
        take(
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
