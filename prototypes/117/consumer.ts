/* PROTOTYPE #117 — throwaway, not part of the library. A minimal model of
   a consumer's best-effort parse of a world document (its
   `parseWorldBestEffort` and the drop-a-piece, keep-the-board path of its
   `validateBoardEntry`), ported onto the kit in `best-effort.ts`. A
   document is a plain object here, not YAML; a position is the entry's
   index. The shapes the consumer's two arrays, its three-state reader and
   its `World.from` retry loop take are kept; the domain is cut to what
   those paths touch. */
import {
  failure,
  isFailure,
  isSuccess,
  success,
} from '../../src/result/index.js'
import type { Result } from '../../src/result/index.js'
import type { Maybe } from '../../src/maybe/index.js'
import { isJust } from '../../src/maybe/index.js'
import {
  andThen,
  bestEffort,
  gather,
  map,
  note,
  recoverWith,
  toResult,
} from './best-effort.js'
import type { BestEffort } from './best-effort.js'

/* ---- the consumer's diagnostic shapes, cut down ------------------------------ */

export type Position = { readonly line: number }
export type WiringDetail = {
  readonly category: 'wiring'
  readonly boardId: string
}
export type EntityLocalDetail = {
  readonly category: 'entity-local'
  readonly boardId: string
  readonly pieceId?: string
}
/** The consumer's `WorldFormatError`: a plain positioned object, not an Error.
 * Untagged (`detail` absent) is a shape failure the strict parse and the
 * best-effort parse both refuse; tagged is tolerated by best effort. */
export type WorldFormatError = {
  readonly message: string
  readonly line?: number
  readonly detail?: WiringDetail | EntityLocalDetail
}
/** The consumer's `BestEffortDrop`: what was excluded, with its raw DTO so the
 * printer can re-merge it. A Piece drop names its Board. */
export type BestEffortDrop =
  | {
      readonly kind: 'stage'
      readonly id: string
      readonly message: string
      readonly line?: number
      readonly raw: StageDTO
    }
  | {
      readonly kind: 'link'
      readonly id: string
      readonly message: string
      readonly line?: number
      readonly raw: LinkDTO
    }
  | {
      readonly kind: 'piece'
      readonly id: string
      readonly boardId: string
      readonly message: string
      readonly line?: number
      readonly raw: PieceDTO
    }

/** `D` for the port: one ordered list holding both of the consumer's kinds. The
 * two arrays the consumer exposes are projections (`partition` below). */
export type Diagnostic = WorldFormatError | BestEffortDrop
export const isDrop = (d: Diagnostic): d is BestEffortDrop => 'kind' in d

/** The consumer's `WorldFormatErrors`: the list as one Error, for `Result`'s
 * error channel. */
export class WorldFormatErrors extends Error {
  constructor(readonly errors: readonly Diagnostic[]) {
    super(errors.map((e) => e.message).join('; '))
    this.name = 'WorldFormatErrors'
  }
}

/** The consumer's two arrays, read off the one list. A Piece excluded after it
 * parsed is one `kind: 'piece'` drop in the list and appears in both
 * projections: as the drop, and as the entity-local diagnostic derived
 * from it, as the consumer's `BestEffortWorld` has it. */
export function partition(diagnostics: readonly Diagnostic[]): {
  dropped: BestEffortDrop[]
  diagnostics: WorldFormatError[]
} {
  const dropped: BestEffortDrop[] = []
  const errors: WorldFormatError[] = []
  for (const d of diagnostics) {
    if (!isDrop(d)) errors.push(d)
    else {
      dropped.push(d)
      if (d.kind === 'piece')
        errors.push({
          message: d.message,
          line: d.line,
          detail: {
            category: 'entity-local',
            boardId: d.boardId,
            pieceId: d.id,
          },
        })
    }
  }
  return { dropped, diagnostics: errors }
}

/* ---- the domain, cut down --------------------------------------------- */

export type PieceDTO = {
  readonly id: string
  readonly x: number
  readonly y: number
  readonly openWhen?: string
}
export type BoardDTO = {
  readonly id: string
  readonly pieces: readonly PieceDTO[]
  readonly signals: readonly string[]
}
export type StageDTO = { readonly id: string; readonly board: string }
export type LinkDTO = {
  readonly id: string
  readonly from: string
  readonly to: string
}
export type WorldDTO = {
  readonly id: string
  readonly boards: readonly BoardDTO[]
  readonly stages: readonly StageDTO[]
  readonly links: readonly LinkDTO[]
}

export type Detail =
  | { readonly category: 'dangling-stage'; readonly id: string }
  | { readonly category: 'dangling-link'; readonly id: string }
  | { readonly category: 'duplicate-id'; readonly id: string }
export class DomainValidationError extends Error {
  constructor(
    message: string,
    readonly detail: Detail,
  ) {
    super(message)
  }
}

export class World {
  private constructor(readonly dto: WorldDTO) {}
  static from(dto: WorldDTO): Result<World, DomainValidationError> {
    const ids = new Set<string>()
    for (const b of dto.boards) {
      if (ids.has(b.id))
        return failure(
          new DomainValidationError(`duplicate id "${b.id}"`, {
            category: 'duplicate-id',
            id: b.id,
          }),
        )
      ids.add(b.id)
    }
    for (const s of dto.stages)
      if (!ids.has(s.board))
        return failure(
          new DomainValidationError(
            `stage "${s.id}" names no board "${s.board}"`,
            { category: 'dangling-stage', id: s.id },
          ),
        )
    for (const l of dto.links)
      if (!ids.has(l.from) || !ids.has(l.to))
        return failure(
          new DomainValidationError(`link "${l.id}" dangles`, {
            category: 'dangling-link',
            id: l.id,
          }),
        )
    return success(new World(dto))
  }
}

/* ---- the readers: a three-state reader as BestEffort<Maybe<T>, D> ----- */

type RawPiece = {
  id?: unknown
  x?: unknown
  y?: unknown
  'open-when'?: unknown
}
type RawBoard = { id?: unknown; pieces?: RawPiece[]; signals?: string[] }
export type RawDocument = {
  format?: unknown
  id?: unknown
  boards?: RawBoard[]
  stages?: StageDTO[]
  links?: LinkDTO[]
}

/** The consumer's `readOpenWhen` through the kit: ok is a Just with no
 * diagnostic, absent a Nothing with none, error a Nothing with one. The
 * consumer's own reader has only those three states and runs its wiring
 * lints later, on the built Board; the port models one lint (an unknown
 * Signal name) at the reader, as a tagged diagnostic over a kept value, to
 * exercise the fourth state, a Just with a diagnostic. */
export function readOpenWhen(
  raw: unknown,
  boardId: string,
  signals: readonly string[],
  line: number,
): BestEffort<Maybe<string>, WorldFormatError> {
  if (raw === undefined) return bestEffort(undefined)
  if (typeof raw !== 'string')
    return bestEffort<Maybe<string>, WorldFormatError>(undefined, [
      { message: 'open-when must be a string', line },
    ])
  if (!signals.includes(raw))
    return bestEffort<Maybe<string>, WorldFormatError>(raw, [
      {
        message: `unknown signal "${raw}"`,
        line,
        detail: { category: 'wiring', boardId },
      },
    ])
  return bestEffort(raw)
}

function readPiece(
  raw: RawPiece,
  boardId: string,
  signals: readonly string[],
  line: number,
): BestEffort<Maybe<PieceDTO>, WorldFormatError> {
  if (
    typeof raw.id !== 'string' ||
    typeof raw.x !== 'number' ||
    typeof raw.y !== 'number'
  )
    /* A Tier 1 shape failure: excluded with a tagged diagnostic only, since
       there is no well-formed DTO to keep. */
    return bestEffort<Maybe<PieceDTO>, WorldFormatError>(undefined, [
      {
        message: `piece #${line} is malformed`,
        line,
        detail: {
          category: 'entity-local',
          boardId,
          ...(typeof raw.id === 'string' ? { pieceId: raw.id } : {}),
        },
      },
    ])
  const { id, x, y } = raw
  return map(
    (openWhen: Maybe<string>): PieceDTO =>
      isJust(openWhen) ? { id, x, y, openWhen } : { id, x, y },
    readOpenWhen(raw['open-when'], boardId, signals, line),
  )
}

/** The Tier 2 cell-occupancy check for one parsed Piece: a Failure names
 * the Piece it collides with. */
class CellTaken extends Error {
  constructor(readonly by: string) {
    super(`cell already taken by "${by}"`)
  }
}
function occupancy(
  piece: PieceDTO,
  seen: Map<string, string>,
): Result<PieceDTO, CellTaken> {
  const key = `${piece.x},${piece.y}`
  const by = seen.get(key)
  if (by !== undefined) return failure(new CellTaken(by))
  seen.set(key, piece.id)
  return success(piece)
}

/** The consumer's `validateBoardEntry`: a shape failure is a Nothing with an
 * untagged diagnostic; a parsed Piece that fails occupancy is dropped
 * through `recoverWith`, with the drop as its diagnostic, and the Board is
 * kept. */
export function validateBoardEntry(
  raw: RawBoard,
  index: number,
): BestEffort<Maybe<BoardDTO>, Diagnostic> {
  if (typeof raw.id !== 'string')
    return bestEffort<Maybe<BoardDTO>, Diagnostic>(undefined, [
      { message: `Board #${index + 1} must have an id`, line: index },
    ])
  const boardId = raw.id
  const signals = raw.signals ?? []
  const parsed = gather(
    (raw.pieces ?? []).map((p, i) => readPiece(p, boardId, signals, i)),
  )
  const seen = new Map<string, string>()
  /* Every callback parameter below is annotated: the kit's `map` and
     `andThen` infer their callback's parameter from the callback alone, as
     `/result`'s do (probe "an un-annotated callback parameter"). */
  return map(
    (kept: readonly Maybe<PieceDTO>[]): Maybe<BoardDTO> => ({
      id: boardId,
      pieces: kept.filter(isJust),
      signals,
    }),
    andThen(
      (pieces: readonly Maybe<PieceDTO>[]) =>
        gather(
          /* `line` is the entry's raw index: `parsed` has one slot per raw
             entry, a malformed one as a Nothing. */
          pieces.flatMap((piece, line) =>
            isJust(piece)
              ? [
                  recoverWith(
                    undefined as Maybe<PieceDTO>,
                    (offense: CellTaken): Diagnostic => ({
                      kind: 'piece',
                      id: piece.id,
                      boardId,
                      message: offense.message,
                      line,
                      raw: piece,
                    }),
                    occupancy(piece, seen),
                  ),
                ]
              : [],
          ),
        ),
      parsed,
    ),
  )
}

/* ---- the parse --------------------------------------------------------- */

/** The consumer's `assembleWorldDocument` plus its prelude: every reader's
 * diagnostics in document order (the `format` gate, the world id, then
 * the boards) over a Maybe of the WorldDTO (Nothing when the world id is
 * missing). The `format` gate is a diagnostic here, where the consumer
 * keeps it beside `assembled` (see `parseWorldBestEffort`). */
export function assemble(
  doc: RawDocument,
): BestEffort<Maybe<WorldDTO>, Diagnostic> {
  const gate: Diagnostic[] =
    doc.format === 'world-v2'
      ? []
      : [{ message: 'format must be world-v2', line: 0 }]
  const idError: Diagnostic[] =
    typeof doc.id === 'string'
      ? []
      : [{ message: 'World is missing required key "id"', line: 0 }]
  const id = doc.id
  const prelude = bestEffort(undefined, [...gate, ...idError])
  return map(
    (boards: readonly Maybe<BoardDTO>[]): Maybe<WorldDTO> =>
      typeof id === 'string'
        ? {
            id,
            boards: boards.filter(isJust),
            stages: doc.stages ?? [],
            links: doc.links ?? [],
          }
        : undefined,
    andThen(() => gather((doc.boards ?? []).map(validateBoardEntry)), prelude),
  )
}

/** The consumer's strict `parseWorld`: any diagnostic at all is a Failure. */
export function parseWorld(doc: RawDocument): Result<World, WorldFormatErrors> {
  const strict = toResult((d) => new WorldFormatErrors(d), assemble(doc))
  /* A Failure is re-wrapped to retarget its phantom `T`, as the consumer writes
     `failure<WorldFormatErrors, BestEffortWorld>(prelude)` today. */
  if (isFailure(strict)) return failure<WorldFormatErrors, World>(strict)
  if (strict === undefined)
    return failure(new WorldFormatErrors([{ message: 'no world id' }]))
  const world = World.from(strict)
  return isFailure(world)
    ? failure(new WorldFormatErrors([{ message: world.message }]))
    : success<World, WorldFormatErrors>(world)
}

const MAX_BEST_EFFORT_DROPS = 64

/* `toResult` has no predicate: any diagnostic makes it a Failure. Which
   diagnostics block is the consumer's decision, made on the list itself:
   `parseWorldBestEffort` tests the list with `blocking` and returns either
   the strict Failure or the Best Effort. */
const blocking = (d: Diagnostic): boolean =>
  !isDrop(d) && d.detail === undefined

/** The consumer's `parseWorldBestEffort`. The pinned policy: an untagged
 * diagnostic, a missing world id, an unattributable `World.from`
 * rejection or an exhausted drop budget is the strict Failure; else the
 * World built from what validated, with every tolerated diagnostic and
 * every drop in order. The format gate is blocking here; the consumer
 * reads `assembled` past the gate (its test pins that), which the
 * port measures as a consumer choice, not as `toResult`'s. */
export function parseWorldBestEffort(
  doc: RawDocument,
): Result<BestEffort<World, Diagnostic>, WorldFormatErrors> {
  const assembled = assemble(doc)
  const strict = parseWorld(doc)
  if (isSuccess(strict)) return success(bestEffort(strict))
  const inert = failure<WorldFormatErrors, BestEffort<World, Diagnostic>>(
    strict,
  )
  if (assembled.diagnostics.some(blocking) || assembled.value === undefined)
    return inert

  let current: BestEffort<WorldDTO, Diagnostic> = bestEffort(
    assembled.value,
    assembled.diagnostics,
  )
  for (let attempt = 0; attempt <= MAX_BEST_EFFORT_DROPS; attempt++) {
    const built = World.from(current.value)
    if (isSuccess(built)) return success(map((): World => built, current))
    if (attempt === MAX_BEST_EFFORT_DROPS) return inert
    const drop = attributeDrop(built, current.value)
    if (drop === undefined) return inert
    current = note(
      [drop],
      map(
        (dto: WorldDTO): WorldDTO =>
          drop.kind === 'stage'
            ? { ...dto, stages: dto.stages.filter((s) => s.id !== drop.id) }
            : { ...dto, links: dto.links.filter((l) => l.id !== drop.id) },
        current,
      ),
    )
  }
  return inert
}

function attributeDrop(
  error: DomainValidationError,
  dto: WorldDTO,
): BestEffortDrop | undefined {
  const { detail } = error
  if (detail.category === 'dangling-stage') {
    const raw = dto.stages.find((s) => s.id === detail.id)
    return raw && { kind: 'stage', id: detail.id, message: error.message, raw }
  }
  if (detail.category === 'dangling-link') {
    const raw = dto.links.find((l) => l.id === detail.id)
    return raw && { kind: 'link', id: detail.id, message: error.message, raw }
  }
  return undefined
}
