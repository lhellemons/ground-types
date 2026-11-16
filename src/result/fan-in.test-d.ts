import { describe, expectTypeOf, it } from 'vitest'
import {
  attempt,
  collect,
  failure,
  isFailure,
  map,
  success,
  tryCatch,
} from './index.js'
import type {
  NotAGenerator,
  NotAPromise,
  Parts,
  Result,
  Take,
} from './index.js'
import type { Branded } from '../brand/index.js'
import { map as mapMaybe } from '../maybe/index.js'

/** One typed error per part, as a domain would have. */
class InvalidId extends Error {
  readonly kind = 'InvalidId' as const
}
class InvalidCount extends Error {
  readonly kind = 'InvalidCount' as const
}
class InvalidName extends Error {
  readonly kind = 'InvalidName' as const
}

type Id = Branded<string, 'Id'>
type Count = Branded<number, 'Count'>
type Name = Branded<string, 'Name'>

declare function id(raw: string): Result<Id, InvalidId>
declare function count(raw: number): Result<Count, InvalidCount>
declare function name(raw: string): Result<Name, InvalidName>

interface ShapeOfId {
  id: Result<Id, InvalidId>
}
declare const readonlyList: readonly Result<Id, InvalidId>[]
declare const withOptional: {
  id: Result<Id, InvalidId>
  n?: Result<Count, InvalidCount>
}
declare const maybeId: Result<Id | undefined, InvalidId>
declare const alias: { id: Result<Id, InvalidId> }
declare const shape: ShapeOfId
declare const unknownPart: unknown
declare const pending: Promise<Result<Id, InvalidId>>
declare const asDictionary: Record<string, Result<Count, InvalidCount>>
declare const asObject: object
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- the case under test: a part typed {}
declare const asEmpty: {}
declare const asVoid: void
declare const optionalTuple: readonly [
  Result<Id, InvalidId>,
  Result<Count, InvalidCount>?,
]
declare const onlyOptional: [Result<Id, InvalidId>?]
// eslint-disable-next-line @typescript-eslint/no-wrapper-object-types -- the case under test: a part typed Object
declare const asBigObject: Object
declare const numberDictionary: Record<number, Result<Count, InvalidCount>>
declare const indexedWithDeclared: {
  [key: string]: unknown
  id: Result<string, InvalidId>
}
declare const intersectedWithDeclared: Record<string, unknown> & {
  id: Result<string, InvalidId>
}
declare const numberIndexed: { [key: number]: Result<Count, InvalidCount> }
declare const stringIndexed: Record<string, Result<Count, InvalidCount>>
declare const underlyingError: Result<number, Error>
declare const idList: Result<Id, InvalidId>[]
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the case under test: a part typed any
declare const loose: any

/** Every member of `Expected` is in `Actual` and nothing else is. */
type SameMembers<Actual, Expected> = [Actual] extends [Expected]
  ? [Expected] extends [Actual]
    ? true
    : false
  : false

describe('collect', () => {
  it('reads an object of parts: unboxed readonly value, exact error union', () => {
    const r = collect({ id: id('a'), n: count(1), label: name('x') })
    expectTypeOf(r).toEqualTypeOf<
      Result<
        { readonly id: Id; readonly n: Count; readonly label: Name },
        InvalidId | InvalidCount | InvalidName
      >
    >()
  })

  it('reads a tuple', () => {
    const r = collect([id('a'), count(1)])
    expectTypeOf(r).toEqualTypeOf<
      Result<readonly [Id, Count], InvalidId | InvalidCount>
    >()
  })

  it('reads a list', () => {
    const r = collect(['a', 'b'].map(id))
    expectTypeOf(r).toEqualTypeOf<Result<readonly Id[], InvalidId>>()
  })

  it('reads a readonly list and an object of parts with an optional member', () => {
    expectTypeOf(collect(readonlyList)).toEqualTypeOf<
      Result<readonly Id[], InvalidId>
    >()
    expectTypeOf(collect(withOptional)).toEqualTypeOf<
      Result<
        { readonly id: Id; readonly n?: Count | undefined },
        InvalidId | InvalidCount
      >
    >()
  })

  it('pins every member of the union: none missing, none extra, no collapse to never', () => {
    const o = collect({ id: id('a'), n: count(1) })
    const t = collect([id('a'), count(1)])
    const l = collect(idList)
    void [o, t, l]
    type OError = Extract<typeof o, Error>
    type TError = Extract<typeof t, Error>
    type LError = Extract<typeof l, Error>
    expectTypeOf<
      SameMembers<OError, InvalidId | InvalidCount>
    >().toEqualTypeOf<true>()
    expectTypeOf<
      SameMembers<TError, InvalidId | InvalidCount>
    >().toEqualTypeOf<true>()
    expectTypeOf<SameMembers<LError, InvalidId>>().toEqualTypeOf<true>()
    expectTypeOf<OError>().not.toBeNever()
  })

  it('passes a plain member through, in the value type and with no error of its own', () => {
    const r = collect({ id: id('a'), version: 2, tags: ['a'] })
    expectTypeOf(r).toEqualTypeOf<
      Result<
        { readonly id: Id; readonly version: number; readonly tags: string[] },
        InvalidId
      >
    >()
    expectTypeOf(collect([id('a'), 5])).toEqualTypeOf<
      Result<readonly [Id, number], InvalidId>
    >()
  })

  it('an object whose parts cannot fail is a Result with a never error', () => {
    const r = collect({ n: 1, s: 'x' })
    expectTypeOf(r).toEqualTypeOf<
      Result<{ readonly n: number; readonly s: string }, never>
    >()
  })

  it('nests: a collect is a part of another', () => {
    const r = collect({ id: id('a'), inner: collect([count(1), name('x')]) })
    expectTypeOf(r).toEqualTypeOf<
      Result<
        { readonly id: Id; readonly inner: readonly [Count, Name] },
        InvalidId | InvalidCount | InvalidName
      >
    >()
  })

  it('refuses a symbol-keyed member of an object of parts', () => {
    const key = Symbol('part')
    // @ts-expect-error - a symbol-keyed member is neither read nor typed
    collect({ id: id('a'), [key]: id('b') })
  })

  it('refuses a __proto__ member, which a literal would use to set the prototype', () => {
    // @ts-expect-error - a literal's __proto__ is not a member
    collect({ id: id('a'), __proto__: id('b') })
    const parsed = JSON.parse('{}') as Record<string, Result<Id, InvalidId>>
    expectTypeOf(collect(parsed)).toEqualTypeOf<
      Result<{ readonly [key: string]: Id }, InvalidId>
    >()
  })

  it('a generic wrapper names its constraint with Parts', () => {
    const wrap = <P extends Parts>(parts: P) => collect(parts)
    expectTypeOf(wrap([id('a')])).toEqualTypeOf<
      Result<readonly [Id], InvalidId>
    >()
  })

  it('takes the type of an object literal or a type alias, not an interface', () => {
    expectTypeOf(collect(alias)).toEqualTypeOf<
      Result<{ readonly id: Id }, InvalidId>
    >()
    // @ts-expect-error - an interface has no implicit index signature
    collect(shape)
  })

  it('refuses a non-parts argument', () => {
    // @ts-expect-error - a number is not an object of parts
    collect(1)
    // @ts-expect-error - a string is not an object of parts
    collect('a')
    // @ts-expect-error - a Map is not an object of parts
    collect(new Map())
  })

  it('a plain member whose type may hold an Error adds nothing to the error type', () => {
    expectTypeOf(collect({ x: unknownPart })).toEqualTypeOf<
      Result<{ readonly x: unknown }, never>
    >()
  })

  it('a declared member keeps its error next to an index signature, and number keys count', () => {
    expectTypeOf(collect(indexedWithDeclared)).toEqualTypeOf<
      Result<
        { readonly [key: string]: unknown; readonly id: string },
        InvalidId
      >
    >()
    expectTypeOf(collect(intersectedWithDeclared)).toEqualTypeOf<
      Result<
        { readonly [key: string]: unknown; readonly id: string },
        InvalidId
      >
    >()
    expectTypeOf(collect({ 0: id('a'), 1: count(1) })).toEqualTypeOf<
      Result<{ readonly 0: Id; readonly 1: Count }, InvalidId | InvalidCount>
    >()
    expectTypeOf(collect(numberIndexed)).toEqualTypeOf<
      Result<{ readonly [key: number]: Count }, InvalidCount>
    >()
    expectTypeOf(collect(stringIndexed)).toEqualTypeOf<
      Result<{ readonly [key: string]: Count }, InvalidCount>
    >()
  })

  it('an optional tuple element keeps the error types of every element', () => {
    expectTypeOf(collect(optionalTuple)).toEqualTypeOf<
      Result<readonly [Id, (Count | undefined)?], InvalidId | InvalidCount>
    >()
    expectTypeOf(collect(onlyOptional)).toEqualTypeOf<
      Result<readonly [(Id | undefined)?], InvalidId>
    >()
  })

  it('an unknown member does not erase the other parts error types', () => {
    expectTypeOf(collect({ id: id('a'), x: unknownPart })).toEqualTypeOf<
      Result<{ readonly id: Id; readonly x: unknown }, InvalidId>
    >()
    expectTypeOf(collect([id('a'), unknownPart])).toEqualTypeOf<
      Result<readonly [Id, unknown], InvalidId>
    >()
    expectTypeOf(
      collect({ id: id('a'), x: unknownPart }, ({ id }) => id),
    ).toEqualTypeOf<Result<Id, InvalidId>>()
    expectTypeOf(collect([unknownPart])).toEqualTypeOf<
      Result<readonly [unknown], never>
    >()
  })

  it('a Promise member is a plain member, its Failure never seen', () => {
    expectTypeOf(collect({ p: pending })).toEqualTypeOf<
      Result<{ readonly p: Promise<Result<Id, InvalidId>> }, never>
    >()
  })

  it('an any part makes the whole result any', () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- the case under test
    const r = collect({ id: id('a'), loose })
    expectTypeOf(r).toBeAny()
  })
})

describe('collect with a build step', () => {
  class Door {
    constructor(
      readonly n: Count,
      readonly id: Id,
    ) {}
  }

  it('types the build parameter from the parts: a swapped constructor argument does not compile', () => {
    const ok = collect(
      { id: id('a'), n: count(1) },
      ({ id, n }) => new Door(n, id),
    )
    expectTypeOf(ok).toEqualTypeOf<Result<Door, InvalidId | InvalidCount>>()
    const swapped = collect(
      { id: id('a'), n: count(1) },
      // @ts-expect-error - Id is not a Count
      ({ id, n }) => new Door(id, n),
    )
    void swapped
    collect({ id: id('a'), n: count(1) }, (parts) => {
      expectTypeOf(parts).toEqualTypeOf<{
        readonly id: Id
        readonly n: Count
      }>()
      return 0
    })
  })

  it('a build that returns any makes the whole result any', () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return -- the case under test: an any result
    const r = collect({ id: id('a') }, () => loose)
    expectTypeOf(r).toBeAny()
  })

  it('a build that returns a Result adds its error to the union, like andThen', () => {
    const r = collect(
      { id: id('a'), n: count(1) },
      ({ id, n }): Result<Door, InvalidName> =>
        n > 0 ? success(new Door(n, id)) : failure(new InvalidName('x')),
    )
    expectTypeOf(r).toEqualTypeOf<
      Result<Door, InvalidId | InvalidCount | InvalidName>
    >()
  })

  it('types a tuple and a list parameter', () => {
    collect([id('a'), count(1)], ([i, n]) => {
      expectTypeOf(i).toEqualTypeOf<Id>()
      expectTypeOf(n).toEqualTypeOf<Count>()
      return 0
    })
    collect(['a'].map(id), (ids) => {
      expectTypeOf(ids).toEqualTypeOf<readonly Id[]>()
      return 0
    })
  })

  it('refuses a build that returns a Promise', () => {
    // @ts-expect-error - resolve first, then compose with .then()
    collect({ id: id('a') }, async ({ id }) => id)
  })

  it('the map step after a collect stays untyped: the gap the build form closes', () => {
    class D {
      constructor(
        readonly n: Count,
        readonly id: Id,
      ) {}
    }
    const parts = collect({ id: id('a'), n: count(1) })
    // `map` infers its callback's parameter from the callback alone, so the
    // swapped arguments compile: the parameter is `any` once destructured.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- the case under test
    const swapped = map(({ id, n }) => new D(id, n), parts)
    expectTypeOf(swapped).toEqualTypeOf<Result<D, InvalidId | InvalidCount>>()
    // The early-return form types each member.
    if (!isFailure(parts)) {
      expectTypeOf(parts.id).toEqualTypeOf<Id>()
      expectTypeOf(parts.n).toEqualTypeOf<Count>()
    }
  })
})

describe('attempt', () => {
  it('finds E in the enclosing return annotation, and take types its value', () => {
    const from = (raw: string): Result<Id, InvalidId> =>
      attempt((take) => {
        const found = take(id(raw))
        expectTypeOf(found).toEqualTypeOf<Id>()
        return found
      })
    expectTypeOf(from).returns.toEqualTypeOf<Result<Id, InvalidId>>()
  })

  it('takes several parts under a union annotation', () => {
    class Door {
      constructor(
        readonly n: Count,
        readonly id: Id,
      ) {}
    }
    const from = (raw: string): Result<Door, InvalidId | InvalidCount> =>
      attempt((take) => new Door(take(count(1)), take(id(raw))))
    expectTypeOf(from).returns.toEqualTypeOf<
      Result<Door, InvalidId | InvalidCount>
    >()
    const swapped = (raw: string): Result<Door, InvalidId | InvalidCount> =>
      // @ts-expect-error - Id is not a Count
      attempt((take) => new Door(take(id(raw)), take(count(1))))
    void swapped
  })

  it('takes a nullish Success, and rejects a primitive that is not a Result', () => {
    const from = (): Result<Id | undefined, InvalidId> =>
      attempt((take) => take(maybeId))
    expectTypeOf(from).returns.toEqualTypeOf<
      Result<Id | undefined, InvalidId>
    >()
    attempt<undefined, InvalidId>((take) => take(undefined))
    attempt<number, InvalidId>((take) =>
      // @ts-expect-error - a primitive is not a Result
      take(5),
    )
  })

  it('takes some non-Result parts whatever E says', () => {
    // The constraint admits them, so an Error in one leaves the attempt typed
    // as E although it is outside E.
    const lenient = (): Result<number, InvalidId> =>
      attempt((take) => {
        take(loose)
        take(asDictionary)
        take(numberDictionary)
        take(asBigObject)
        take(asObject)
        take(asEmpty)
        take(asVoid)
        return 1
      })
    const constrained = <P extends object>(
      part: P,
    ): Result<number, InvalidId> =>
      attempt((take) => {
        take(part)
        return 1
      })
    void constrained
    expectTypeOf(lenient).returns.toEqualTypeOf<Result<number, InvalidId>>()
  })

  it('error types compare structurally: an Error subclass with no members counts as Error', () => {
    class Plain extends Error {}
    attempt<number, Plain>((take) => take(underlyingError))
  })

  it('rejects a take of a part whose error is outside E', () => {
    const from = (raw: string): Result<Id, InvalidId> =>
      attempt((take) => {
        // @ts-expect-error - InvalidCount is outside InvalidId
        take(count(1))
        return take(id(raw))
      })
    void from
  })

  it('with no contextual type E is Error', () => {
    const r = attempt((take) => take(id('a')))
    expectTypeOf(r).toEqualTypeOf<Result<Id, Error>>()
  })

  it('takes E from a take parameter annotated Take<E>, with no other context', () => {
    const r = attempt((take: Take<InvalidId>) => take(id('a')))
    expectTypeOf(r).toEqualTypeOf<Result<Id, InvalidId>>()
  })

  it('takes an explicit E where there is no annotation', () => {
    const r = attempt<Id, InvalidId>((take) => take(id('a')))
    expectTypeOf(r).toEqualTypeOf<Result<Id, InvalidId>>()
  })

  it('a take is the Take of its E, and can be passed on', () => {
    const useIt = (take: Take<InvalidId>): Id => take(id('a'))
    const r: Result<Id, InvalidId> = attempt(useIt)
    void r
  })

  it('under an annotation a return of a failure() in the body is a type error', () => {
    const from = (raw: string): Result<Id, InvalidId> =>
      // @ts-expect-error - a returned Failure is a value of the body; use take(failure(…))
      attempt((take) => {
        if (raw === '') return failure(new InvalidId('empty'))
        return take(id(raw))
      })
    void from
    const leaving = (raw: string): Result<Id, InvalidId> =>
      attempt((take) => {
        if (raw === '') take(failure(new InvalidId('empty')))
        return take(id(raw))
      })
    void leaving
  })

  it('refuses an async body and a generator body, with the diagnostic of its type', () => {
    const asyncBody = async (take: Take<InvalidId>) => take(id('a'))
    const generatorBody = function* (take: Take<InvalidId>) {
      yield take(id('a'))
    }
    const asyncGeneratorBody = async function* (take: Take<InvalidId>) {
      yield take(id('a'))
    }
    // @ts-expect-error - resolve first, then compose with .then()
    attempt(asyncBody)
    // @ts-expect-error - attempt runs its body to completion
    attempt(generatorBody)
    // @ts-expect-error - attempt runs its body to completion
    attempt(asyncGeneratorBody)
    expectTypeOf<
      NotAPromise<ReturnType<typeof asyncBody>>
    >().toEqualTypeOf<'This callback returns a Promise (or thenable) — resolve it first with promise/resultify or call/resultify, then compose with .then()'>()
    expectTypeOf<
      NotAGenerator<ReturnType<typeof generatorBody>>
    >().toEqualTypeOf<'This body returns a generator — attempt runs its body to completion, so write a plain function'>()
    expectTypeOf<
      NotAGenerator<ReturnType<typeof asyncGeneratorBody>>
    >().toEqualTypeOf<'This body returns a generator — attempt runs its body to completion, so write a plain function'>()
  })

  it('refuses a body whose return type is a union with a thenable or generator member', () => {
    // @ts-expect-error - a union with a Promise arm is refused
    attempt((take) => (take(id('a')) === 'a' ? 1 : Promise.resolve(2)))
  })

  it('refuses a body that only passes through a part of an unresolved generic type', () => {
    const generic = <X extends Result<string, Error>>(part: X) =>
      // @ts-expect-error - ValueOf<X> cannot be judged
      attempt((take) => take(part))
    void generic
  })

  it('refuses a body whose return type is a union with a generator', () => {
    // @ts-expect-error - a union with a generator arm is refused
    attempt((take) => (take(id('a')) === 'a' ? 1 : (function* () {})()))
  })

  it('takes E from a variable annotation and from a parameter type', () => {
    const viaVariable: Result<Id, InvalidId> = attempt((take) => {
      // @ts-expect-error - InvalidCount is outside the variable's InvalidId
      take(count(1))
      return take(id('a'))
    })
    const accepts = (result: Result<Id, InvalidId>): void => void result
    accepts(
      attempt((take) => {
        // @ts-expect-error - InvalidCount is outside the parameter's InvalidId
        take(count(1))
        return take(id('a'))
      }),
    )
    void viaVariable
  })

  it('does not refuse a type a Promise or a generator fits without being one, however it is given', () => {
    // Each of these compiles: the guard checks T, and these types fit a Promise.
    attempt<unknown>(async () => 1)
    attempt<object>(async () => 1)
    attempt<{}>(async () => 1) // eslint-disable-line @typescript-eslint/no-empty-object-type -- the case under test
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the case under test
    attempt<any>(async () => 1)
    attempt<object>(function* () {
      yield 1
    })
    attempt(function* (): IterableIterator<number> {
      yield 1
    })
    tryCatch(function* () {
      yield 1
    })
    // eslint-disable-next-line @typescript-eslint/no-misused-promises -- the case under test: an async body typed as returning void
    const widened: (take: Take<Error>) => void = async () => {}
    attempt(widened)
  })

  it('accepts a body that returns a plain array, an iterator that is not a generator or an any', () => {
    const arr = attempt((take) => [take(id('a'))])
    expectTypeOf(arr).toEqualTypeOf<Result<Id[], Error>>()
    const values = attempt(() => [1, 2].values())
    expectTypeOf(values).toEqualTypeOf<
      Result<ReturnType<number[]['values']>, Error>
    >()
    const parsed = attempt((take) => JSON.parse(take(id('a'))) as unknown)
    expectTypeOf(parsed).toEqualTypeOf<Result<unknown, Error>>()
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return -- the case under test: an any result
    const loosely = attempt((take) => JSON.parse(take(id('a'))))
    expectTypeOf(loosely).toBeAny()
  })

  it("with explicit type arguments the body's Error is not in the result, and isFailure narrows it to E", () => {
    const r = attempt<Result<Id, InvalidName>, InvalidId>((take) =>
      take(id('a')) === 'a'
        ? failure(new InvalidName('x'))
        : success(take(id('b'))),
    )
    expectTypeOf(r).toEqualTypeOf<Result<Result<Id, InvalidName>, InvalidId>>()
    // The Failure is an InvalidName at run time, and the type says InvalidId.
    if (isFailure(r)) expectTypeOf(r.kind).toEqualTypeOf<'InvalidId'>()
  })

  it('under an annotation whose value type admits an Error, a returned Failure of another type compiles', () => {
    const from = (raw: string): Result<unknown, InvalidId> =>
      attempt((take) => {
        take(id(raw))
        return failure(new InvalidName('x'))
      })
    expectTypeOf(from).returns.toEqualTypeOf<Result<unknown, InvalidId>>()
  })

  it('a generic wrapper repeats the constraint with NotAPromise and NotAGenerator', () => {
    const wrap = <T extends NotAPromise<T> & NotAGenerator<T>>(
      body: (take: Take<Error>) => T,
    ) => attempt(body)
    expectTypeOf(wrap((take) => take(id('a')))).toEqualTypeOf<
      Result<Id, Error>
    >()
  })

  it('take works inside a list map and a Maybe map callback', () => {
    const ids = (raws: string[]): Result<Id[], InvalidId> =>
      attempt((take) => raws.map((raw) => take(id(raw))))
    expectTypeOf(ids).returns.toEqualTypeOf<Result<Id[], InvalidId>>()
    const opt = (raw: string | undefined): Result<Id | undefined, InvalidId> =>
      attempt((take) => mapMaybe((r: string) => take(id(r)), raw))
    expectTypeOf(opt).returns.toEqualTypeOf<Result<Id | undefined, InvalidId>>()
  })
})
