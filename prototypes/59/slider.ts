/* PROTOTYPE #59 — throwaway, not part of the library. A minimal model of the
   slider domain the three factories are built from (`src/domain/grid/
   position.ts`, `src/domain/board/door.ts`, `src/domain/slide/slide.ts`),
   with one typed error per leaf where slider uses `Error`. Each arm file
   builds Position, Door and Slide from these leaves its own way. */
import { catchOnly, failure, success } from '../../src/result/index.js'
import type { Result } from '../../src/result/index.js'
import type { Branded } from '../../src/brand/index.js'
import { definePrimitiveValueObject } from '../../src/value-object/index.js'

/* Leaf errors. Each carries a distinguishing member, as a real domain
   error does; without one TypeScript reads them all as `Error`. */
export class InvalidPieceId extends Error {
  readonly code = 'invalid-piece-id' as const
}
export class InvalidCoordinate extends Error {
  readonly code = 'invalid-coordinate' as const
}
export class OpenWhenSyntaxError extends Error {
  readonly code = 'open-when-syntax' as const
  constructor(
    message: string,
    readonly column: number,
  ) {
    super(message)
  }
}
export class InvalidCollectibleGroup extends Error {
  readonly code = 'invalid-collectible-group' as const
}
export class InvalidUnlockCount extends Error {
  readonly code = 'invalid-unlock-count' as const
}
export class InvalidDirection extends Error {
  readonly code = 'invalid-direction' as const
}
export class InvalidTerminalEvent extends Error {
  readonly code = 'invalid-terminal-event' as const
}
/* The factories' own errors: the checks a part cannot make on its own. */
export class WrongKind extends Error {
  readonly code = 'wrong-kind' as const
}
export class BothGateForms extends Error {
  readonly code = 'both-gate-forms' as const
}
export class EmptyPath extends Error {
  readonly code = 'empty-path' as const
}
export class IdWithoutTerminal extends Error {
  readonly code = 'id-without-terminal' as const
}

/* Leaf value objects, as slider defines them, with a typed handler. */
export type PieceId = Branded<string, 'PieceId'>
export const PieceId = definePrimitiveValueObject((value: string): PieceId => {
  if (!/^[a-z][a-z0-9-]*$/.test(value))
    throw new InvalidPieceId(`"${value}" is not a piece id`)
  return value as PieceId
}, catchOnly(InvalidPieceId))

export type Coordinate = Branded<number, 'Coordinate'>
export const Coordinate = definePrimitiveValueObject(
  (value: number): Coordinate => {
    if (!Number.isInteger(value) || value < 0)
      throw new InvalidCoordinate(
        `A coordinate must be a non-negative integer, got ${value}`,
      )
    return value as Coordinate
  },
  catchOnly(InvalidCoordinate),
)

export type CollectibleGroup = Branded<string, 'CollectibleGroup'>
export const CollectibleGroup = definePrimitiveValueObject(
  (value: string): CollectibleGroup => {
    if (!/^[a-z]+$/.test(value))
      throw new InvalidCollectibleGroup(`"${value}" is not a group`)
    return value as CollectibleGroup
  },
  catchOnly(InvalidCollectibleGroup),
)

export type UnlockCount = Branded<number, 'UnlockCount'>
export const UnlockCount = definePrimitiveValueObject(
  (value: number): UnlockCount => {
    if (!Number.isInteger(value) || value < 1)
      throw new InvalidUnlockCount(
        `unlock-with count must be a positive integer, got ${value}`,
      )
    return value as UnlockCount
  },
  catchOnly(InvalidUnlockCount),
)

export type Direction = 'up' | 'down' | 'left' | 'right'
const directions: readonly Direction[] = ['up', 'down', 'left', 'right']
export const Direction = {
  from(value: string): Result<Direction, InvalidDirection> {
    return (directions as readonly string[]).includes(value)
      ? success(value as Direction)
      : failure(new InvalidDirection(`"${value}" is not a direction`))
  },
}

export type TerminalEvent = 'stopped-by-obstacle' | 'entered-link' | 'fell-off'
const terminals: readonly TerminalEvent[] = [
  'stopped-by-obstacle',
  'entered-link',
  'fell-off',
]
export const TerminalEvent = {
  from(value: string): Result<TerminalEvent, InvalidTerminalEvent> {
    return (terminals as readonly string[]).includes(value)
      ? success(value as TerminalEvent)
      : failure(new InvalidTerminalEvent(`"${value}" is not a terminal`))
  },
}

/* `parseOpenWhen` stands in for slider's mechanism parser: a single bit
   name, or a syntax error with the offending column. */
export type OpenWhenExpr = { readonly bit: string }
export function parseOpenWhen(
  text: string,
): Result<OpenWhenExpr, OpenWhenSyntaxError> {
  const m = /^[a-z_]+$/.exec(text)
  if (m === null) {
    const column = [...text].findIndex((c) => !/[a-z_]/.test(c))
    return failure(new OpenWhenSyntaxError(`bad open-when "${text}"`, column))
  }
  return success({ bit: text })
}

/* DTOs, as slider spells them. */
export type PositionDTO = { x: number; y: number }
export type UnlockWithDTO = { group: string; count: number }
export type DoorDTO = {
  kind: 'door'
  id: string
  at: PositionDTO
  'open-when'?: string
  'unlock-with'?: UnlockWithDTO
  persistent?: boolean
}
export type SlideDTO = {
  direction: string
  terminal: string
  path: PositionDTO[]
  pieceId?: string
}

/* A hook for the bug-propagation probes: a part factory with a programming
   error in it. `Position.from` in every arm calls `coordinateOf`, so a
   probe can make a bug happen inside a part. */
export let coordinateOf: (
  value: number,
) => Result<Coordinate, InvalidCoordinate> = Coordinate.from
export function plantBug(bug: (() => never) | undefined): void {
  coordinateOf = bug === undefined ? Coordinate.from : bug
}

/* The error unions each factory should end up with, for the probes to
   compare against. Slider today writes `Error` for all three. */
export type PositionError = InvalidCoordinate
export type DoorError =
  | WrongKind
  | BothGateForms
  | InvalidPieceId
  | PositionError
  | OpenWhenSyntaxError
  | InvalidCollectibleGroup
  | InvalidUnlockCount
export type SlideError =
  | InvalidDirection
  | InvalidTerminalEvent
  | EmptyPath
  | PositionError
  | InvalidPieceId
  | IdWithoutTerminal
