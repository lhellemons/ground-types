/* PROTOTYPE #59 — throwaway type probes. What each candidate infers, and
   what it rejects, measured against src/ on main. */
import { describe, expectTypeOf, it } from 'vitest'
import {
  andThen,
  failure,
  isFailure,
  map,
  success,
} from '../../src/result/index.js'
import type { Failure, Result } from '../../src/result/index.js'
import type { ErrorOf, ValueOf } from '../../src/result/internal.js'
import { attempt, collect, collectAll, gen, take } from './fan-in.js'
import type { Failures } from './fan-in.js'
import { Coordinate, InvalidPieceId, PieceId } from './slider.js'
import type {
  BothGateForms,
  DoorDTO,
  DoorError,
  InvalidCollectibleGroup,
  InvalidCoordinate,
  InvalidUnlockCount,
  OpenWhenSyntaxError,
  PositionError,
  SlideDTO,
  SlideError,
  WrongKind,
} from './slider.js'
import * as Current from './current.js'
import * as A from './arm-a.js'
import * as B from './arm-b.js'
import * as C from './arm-c.js'

type Returned<F extends (...args: never[]) => unknown> = ReturnType<F>

describe('slider today: tryCatch + assertSuccess', () => {
  it('widens every factory to Error', () => {
    expectTypeOf<
      ErrorOf<Returned<typeof Current.Door.from>>
    >().toEqualTypeOf<Error>()
    expectTypeOf<
      ErrorOf<Returned<typeof Current.Slide.from>>
    >().toEqualTypeOf<Error>()
  })
})

describe('A. collect', () => {
  it('infers the struct, the error union, and passes a plain value through', () => {
    const r = collect({ id: PieceId.from('a'), x: Coordinate.from(1), n: 5 })
    expectTypeOf<ValueOf<typeof r>>().toEqualTypeOf<{
      id: PieceId
      x: Coordinate
      n: 5
    }>()
    expectTypeOf<ErrorOf<typeof r>>().toEqualTypeOf<
      InvalidPieceId | InvalidCoordinate
    >()
  })

  it('the ADR examples, with Position.from annotated (arm B)', () => {
    const s = collect({
      id: PieceId.from('a'),
      at: B.Position.from({ x: 1, y: 2 }),
    })
    expectTypeOf(s).toEqualTypeOf<
      Result<
        { id: PieceId; at: B.Position },
        InvalidPieceId | InvalidCoordinate
      >
    >()
    const l = collect([{ x: 1, y: 2 }].map(B.Position.from))
    expectTypeOf(l).toEqualTypeOf<Result<B.Position[], InvalidCoordinate>>()
  })

  it('the construction step: map/andThen type E but not the value; the early-return form types the parts', () => {
    class D {
      constructor(
        readonly n: Coordinate,
        readonly id: PieceId,
      ) {}
    }
    const parts = collect({ id: PieceId.from('a'), n: Coordinate.from(1) })
    // `map` infers its callback's parameter from the callback alone...
    const swapped = map(({ id, n }) => new D(id, n), parts)
    expectTypeOf(swapped).toEqualTypeOf<
      Result<D, InvalidPieceId | InvalidCoordinate>
    >()
    map(({ id }) => {
      expectTypeOf(id).toBeAny()
      return 0
    }, parts)
    map((p) => {
      expectTypeOf(p).toBeUnknown()
      return 0
    }, parts)
    // ...and `andThen` the same.
    andThen(({ id, n }) => success(new D(id, n)), parts)
    // The early-return form carries each member's type.
    if (!isFailure(parts)) {
      expectTypeOf(parts.id).toEqualTypeOf<PieceId>()
      expectTypeOf(parts.n).toEqualTypeOf<Coordinate>()
      // @ts-expect-error - PieceId is not a Coordinate
      new D(parts.id, parts.n)
    }
    // B's take types its value.
    attempt<D, InvalidPieceId | InvalidCoordinate>((take) => {
      const id = take(PieceId.from('a'))
      expectTypeOf(id).toEqualTypeOf<PieceId>()
      // @ts-expect-error - PieceId is not a Coordinate
      return new D(id, take(Coordinate.from(1)))
    })
  })

  it('infers a tuple and a list', () => {
    const t = collect([PieceId.from('a'), Coordinate.from(1)])
    expectTypeOf(t).toEqualTypeOf<
      Result<[PieceId, Coordinate], InvalidPieceId | InvalidCoordinate>
    >()
    const l = collect(['a', 'b'].map((s) => PieceId.from(s)))
    expectTypeOf(l).toEqualTypeOf<Result<PieceId[], InvalidPieceId>>()
  })

  it('un-annotated factories: Door and Slide infer the union through map/andThen, with the Position leak in it', () => {
    expectTypeOf<
      ValueOf<Returned<typeof A.Door.from>>
    >().toEqualTypeOf<A.Door>()
    // Every member of the union is present (the Exclude), and nothing
    // outside it (the toExtend)...
    expectTypeOf<ErrorOf<Returned<typeof A.Door.from>>>().toExtend<DoorError>()
    expectTypeOf<
      Exclude<DoorError, ErrorOf<Returned<typeof A.Door.from>>>
    >().toEqualTypeOf<never>()
    expectTypeOf<
      ErrorOf<Returned<typeof A.Slide.from>>
    >().toExtend<SlideError>()
    expectTypeOf<
      Exclude<SlideError, ErrorOf<Returned<typeof A.Slide.from>>>
    >().toEqualTypeOf<never>()
    // ...but the leak from Position.from's un-annotated early return
    // (below) travels up: the union holds `InvalidCoordinate & { markers }`.
    expectTypeOf<
      ErrorOf<Returned<typeof A.Door.from>>
    >().not.toEqualTypeOf<DoorError>()
    const door = (dto: DoorDTO): Result<A.Door, DoorError> => A.Door.from(dto)
    const slide = (dto: SlideDTO): Result<A.Slide, SlideError> =>
      A.Slide.from(dto)
    void [door, slide]
  })

  it('un-annotated, the early returns make a union of Results that isFailure cannot take', () => {
    const d = A.Door.from({ kind: 'door', id: 'a', at: { x: 1, y: 2 } })
    // @ts-expect-error - Failure<never, WrongKind> | Result<Door, ...> is not one Result<T, E>
    isFailure(d)
    // Annotated, it is one Result and narrows as usual.
    const r: Result<A.Door, DoorError> = d
    if (isFailure(r))
      expectTypeOf(r).toEqualTypeOf<Failure<A.Door, DoorError>>()
  })

  it('un-annotated early return: assignable to the exact Result, but the inferred error carries the re-wrapped Failure', () => {
    // The cosmetic leak: `failure(parts)` infers E as the whole Failure.
    expectTypeOf<
      ErrorOf<Returned<typeof A.Position.from>>
    >().not.toEqualTypeOf<PositionError>()
    expectTypeOf<
      ErrorOf<Returned<typeof A.Position.from>>
    >().toExtend<PositionError>()
    expectTypeOf<
      Exclude<PositionError, ErrorOf<Returned<typeof A.Position.from>>>
    >().toEqualTypeOf<never>()
    // Annotated, the early return reads as intended.
    const from = (dto: {
      x: number
      y: number
    }): Result<A.Position, PositionError> => A.Position.from(dto)
    expectTypeOf(from).returns.toEqualTypeOf<
      Result<A.Position, PositionError>
    >()
  })

  it('accumulation: Failures over the parts union, nested for a nested struct', () => {
    const r = collectAll({ id: PieceId.from('a'), x: Coordinate.from(1) })
    expectTypeOf<ErrorOf<typeof r>>().toEqualTypeOf<
      Failures<InvalidPieceId | InvalidCoordinate>
    >()
    expectTypeOf<ErrorOf<typeof r>['errors']>().toEqualTypeOf<
      (InvalidPieceId | InvalidCoordinate)[]
    >()
    // The preconditions stay plain; the parts' failures nest per struct.
    const doorAll = (
      dto: DoorDTO,
    ): Result<
      A.Door,
      | WrongKind
      | BothGateForms
      | Failures<
          | InvalidPieceId
          | InvalidCoordinate
          | OpenWhenSyntaxError
          | Failures<InvalidCollectibleGroup | InvalidUnlockCount>
        >
    > => A.Door.fromAll(dto)
    void doorAll
  })
})

describe('B. attempt/take', () => {
  it('with no contextual type E falls to its constraint, Error, not to the parts', () => {
    const r = attempt((take) => take(PieceId.from('a')))
    expectTypeOf(r).toEqualTypeOf<Result<PieceId, Error>>()
  })

  it('a return annotation supplies E, and take then rejects a part outside it', () => {
    const ok = (): Result<PieceId, InvalidPieceId> =>
      attempt((take) => take(PieceId.from('a')))
    expectTypeOf(ok).returns.toEqualTypeOf<Result<PieceId, InvalidPieceId>>()
    const bad = (): Result<PieceId, InvalidPieceId> =>
      attempt((take) => {
        // @ts-expect-error - InvalidCoordinate is outside E
        take(Coordinate.from(1))
        return take(PieceId.from('a'))
      })
    void bad
  })

  it('an explicit E works where there is no annotation', () => {
    const r = attempt<PieceId, InvalidPieceId>((take) =>
      take(PieceId.from('a')),
    )
    expectTypeOf(r).toEqualTypeOf<Result<PieceId, InvalidPieceId>>()
  })

  it("with slider's own annotation, Result<X, Error>, E is Error and every take passes", () => {
    const from = (dto: DoorDTO): Result<B.Door, Error> =>
      attempt((take) => {
        take(Coordinate.from(dto.at.x))
        return take(B.Door.from(dto))
      })
    expectTypeOf(from).returns.toEqualTypeOf<Result<B.Door, Error>>()
  })

  it('cost: a plain return failure() in the body lands in T, and E stays Error', () => {
    const r = attempt((take) => {
      if (Math.random() > 2) return failure(new InvalidPieceId('x'))
      return take(Coordinate.from(1))
    })
    expectTypeOf<Extract<ValueOf<typeof r>, Error>>().not.toEqualTypeOf<never>()
    expectTypeOf<ErrorOf<typeof r>>().toEqualTypeOf<Error>()
  })

  it('cost: an async body compiles, as a Result of a Promise', () => {
    const r = attempt<Promise<PieceId>, InvalidPieceId>(async (take) =>
      take(PieceId.from('a')),
    )
    expectTypeOf(r).toEqualTypeOf<Result<Promise<PieceId>, InvalidPieceId>>()
  })
})

describe('C. gen / yield* take', () => {
  it('un-annotated factories infer the exact union, dependent steps included', () => {
    expectTypeOf(C.Position.from).returns.toEqualTypeOf<
      Result<C.Position, PositionError>
    >()
    expectTypeOf(C.Door.from).returns.toEqualTypeOf<Result<C.Door, DoorError>>()
    expectTypeOf(C.Slide.from).returns.toEqualTypeOf<
      Result<C.Slide, SlideError>
    >()
    expectTypeOf(C.Slide.fromWithCollect).returns.toEqualTypeOf<
      Result<C.Slide, SlideError>
    >()
  })

  it('take only accepts a Result', () => {
    gen(function* () {
      // @ts-expect-error - a number is not a Result
      yield* take(5)
      return 0
    })
  })

  it('a plain return of a failure lands in T, not E (the trap the docblock names)', () => {
    const r = gen(function* () {
      if (Math.random() > 2) return Coordinate.from(-1)
      return yield* take(PieceId.from('a'))
    })
    // The returned Failure sits in the value side: a nested Result.
    expectTypeOf<ErrorOf<typeof r>>().toEqualTypeOf<InvalidPieceId>()
    expectTypeOf<Extract<ValueOf<typeof r>, Error>>().not.toEqualTypeOf<never>()
  })
})
