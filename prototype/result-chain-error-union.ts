// Prototype for #49 — does the error-type union survive a long chain?
//
// Unlike #43/#45 this is NOT self-contained: the point is the shipped
// inference, so the pipe side imports the real /result and /fn modules and
// the Box side is the restated surface (#42) declared here, pinned against
// the pipe side by type-equality at every checkpoint. ValueOf/ErrorOf are
// exported from src/result on this branch only — the phantom-handle symbols
// are module-private, so a Box outside that file cannot restate types
// without them (a placement constraint for #44).
//
//   npx tsc --noEmit --strict --target es2022 --lib es2022,dom \
//     --module nodenext --moduleResolution nodenext \
//     prototype/result-chain-error-union.ts
//
// Chain: 32 links, each adding a structurally distinct error arm Err<N>.
// Checkpoints at 4 / 10 / 16 / 32 — 10 is one full pipe overload ladder;
// 16 and 32 continue by nesting pipe calls, as a real consumer would.

import { pipe } from '../src/fn/index.js'
import { andThen, fallback, mapError, success } from '../src/result/index.js'
import type {
  ErrorOf,
  Failure,
  NotAPromise,
  Result,
  Success,
  ValueOf,
} from '../src/result/index.js'

// ---- the instruments ----

// One generic class instead of 32 hand-written ones: Err<1> and Err<2> are
// structurally distinct through `n`, so a union keeps every arm apart.
declare class Err<N extends number> extends Error {
  readonly n: N
}

// Link N: a fallible step that can fail with exactly Err<N>.
declare function step<N extends number>(
  n: N,
): (v: number) => Result<number, Err<N>>

// Seeded with E = never so the union under measurement contains only what
// the links themselves contribute. NB: real entry points default E = Error —
// `success(0)` seeds a plain Error arm that then rides the whole chain.
declare const seed: Success<number, never>

type Eq<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false
// #45's corrected helper: the check must land in argument position to bite.
declare function expectType<Want>(): <Got>(
  g: Got,
  ...check: Eq<Want, Got> extends true ? [] : [{ want: Want; got: Got }]
) => void

// ---- the restated Box surface (what #44 will write, minimally) ----
// Per #39 the Box is parameterised by the unboxed type it holds; per #42
// members are restated, not aliased — each return type is the functional
// counterpart's, spelled with the module's own ValueOf/ErrorOf.
declare class ResultBox<R> {
  private constructor()

  static from<T, E extends Error = Error>(value: T | E): ResultBox<Result<T, E>>

  andThen<U extends NotAPromise<U>>(
    fn: (value: ValueOf<R>) => U,
  ): ResultBox<Result<ValueOf<U>, ErrorOf<R> | ErrorOf<U>>>

  mapError<S extends NotAPromise<S>>(
    fn: (error: ErrorOf<R>) => S,
  ): ResultBox<Result<ValueOf<R> | ValueOf<S>, ErrorOf<S>>>

  fallback(
    fn: (
      error: Failure<ValueOf<R>, ErrorOf<R>>,
    ) => Success<ValueOf<R>, ErrorOf<R>>,
  ): ResultBox<Success<ValueOf<R>, ErrorOf<R>>>

  unbox(): R
  get result(): R
}

// Same held type as the pipe seed, by construction — entry statics are #44's
// business, not this ticket's.
declare const bSeed: ResultBox<typeof seed>

// ---- the expected unions ----
type E4 = Err<1> | Err<2> | Err<3> | Err<4>
type E10 = E4 | Err<5> | Err<6> | Err<7> | Err<8> | Err<9> | Err<10>
type E16 = E10 | Err<11> | Err<12> | Err<13> | Err<14> | Err<15> | Err<16>
type E32 =
  | E16
  | Err<17>
  | Err<18>
  | Err<19>
  | Err<20>
  | Err<21>
  | Err<22>
  | Err<23>
  | Err<24>
  | Err<25>
  | Err<26>
  | Err<27>
  | Err<28>
  | Err<29>
  | Err<30>
  | Err<31>
  | Err<32>

// ================= question 1: does accumulation survive? =================

const p4 = pipe(
  seed,
  andThen(step(1)),
  andThen(step(2)),
  andThen(step(3)),
  andThen(step(4)),
)
expectType<Result<number, E4>>()(p4)

const p10 = pipe(
  p4,
  andThen(step(5)),
  andThen(step(6)),
  andThen(step(7)),
  andThen(step(8)),
  andThen(step(9)),
  andThen(step(10)),
)
expectType<Result<number, E10>>()(p10)

const p16 = pipe(
  p10,
  andThen(step(11)),
  andThen(step(12)),
  andThen(step(13)),
  andThen(step(14)),
  andThen(step(15)),
  andThen(step(16)),
)
expectType<Result<number, E16>>()(p16)

const p26 = pipe(
  p16,
  andThen(step(17)),
  andThen(step(18)),
  andThen(step(19)),
  andThen(step(20)),
  andThen(step(21)),
  andThen(step(22)),
  andThen(step(23)),
  andThen(step(24)),
  andThen(step(25)),
  andThen(step(26)),
)
const p32 = pipe(
  p26,
  andThen(step(27)),
  andThen(step(28)),
  andThen(step(29)),
  andThen(step(30)),
  andThen(step(31)),
  andThen(step(32)),
)
expectType<Result<number, E32>>()(p32)

// The applied form is the other way a chain grows past the ladder — one
// statement per link. Spot-checked rather than repeated 32 times.
const a5 = andThen(step(5), p4)
expectType<Result<number, E4 | Err<5>>>()(a5)

// ================= question 2: does the Box diverge? =================

const b4 = bSeed
  .andThen(step(1))
  .andThen(step(2))
  .andThen(step(3))
  .andThen(step(4))
const b10 = b4
  .andThen(step(5))
  .andThen(step(6))
  .andThen(step(7))
  .andThen(step(8))
  .andThen(step(9))
  .andThen(step(10))
const b16 = b10
  .andThen(step(11))
  .andThen(step(12))
  .andThen(step(13))
  .andThen(step(14))
  .andThen(step(15))
  .andThen(step(16))
const b32 = b16
  .andThen(step(17))
  .andThen(step(18))
  .andThen(step(19))
  .andThen(step(20))
  .andThen(step(21))
  .andThen(step(22))
  .andThen(step(23))
  .andThen(step(24))
  .andThen(step(25))
  .andThen(step(26))
  .andThen(step(27))
  .andThen(step(28))
  .andThen(step(29))
  .andThen(step(30))
  .andThen(step(31))
  .andThen(step(32))

// Identical to the pipe form at every checkpoint — #39's prediction.
expectType<typeof p4>()(b4.unbox())
expectType<typeof p10>()(b10.unbox())
expectType<typeof p16>()(b16.unbox())
expectType<typeof p32>()(b32.unbox())
// And against the expected union directly, so both styles degrading in
// lockstep cannot slip past the comparison above.
expectType<Result<number, E32>>()(b32.unbox())

// ================= question 3: mapError and fallback mid-chain =================

declare class Translated extends Error {
  readonly source: E4
}

// Translation: four arms collapse to one, and the chain continues clean.
const pT = pipe(p4, mapError((_e: E4) => new Translated()), andThen(step(5)))
expectType<Result<number, Translated | Err<5>>>()(pT)
const bT = b4.mapError((_e: E4) => new Translated()).andThen(step(5))
expectType<typeof pT>()(bT.unbox())

// No dead arms left behind: a handler for a translated-away arm must not
// typecheck (mapError's `E extends A` rejects it).
// @ts-expect-error — Err<1> is gone after translation
pipe(pT, mapError((_e: Err<1>) => new Translated()))

// Recovery: a handler returning a Success empties the union entirely, even
// with `success(0)`'s defaulted E = Error — ErrorOf reads the _error handle,
// which a Success does not carry.
const pR = pipe(p4, mapError((_e: E4) => success(0)), andThen(step(5)))
expectType<Result<number, Err<5>>>()(pR)
const bR = b4.mapError((_e: E4) => success(0)).andThen(step(5))
expectType<typeof pR>()(bR.unbox())

// fallback mid-chain: the recovered Success keeps the old union in its
// phantom channel. Does the next link resurrect the dead arms?
const pF = pipe(
  p4,
  fallback((_e: Failure<number, E4>) => success<number, E4>(0)),
  andThen(step(5)),
)
const bF = b4.fallback(() => success<number, E4>(0)).andThen(step(5))

// THE ONE DIVERGENCE THE RUN FOUND. In the pipe form, andThen re-infers E
// from the recovered Success's phantom channel, so the four dead arms —
// impossible at runtime after fallback — reappear in the type. The Box's
// restated andThen computes ErrorOf of the held type instead, and ErrorOf
// reads only the _error handle, which a Success does not carry: the dead
// arms stay dead. The Box type is a strict narrowing of the pipe type —
// #43's amended parity rule ("its counterpart's return type, or a narrowing
// of it") licenses it, but #44 must pin it deliberately.
expectType<Result<number, E4 | Err<5>>>()(pF)
expectType<Result<number, Err<5>>>()(bF.unbox())
const _boxNarrowsPipe: typeof pF = bF.unbox()

// ---- wrinkles for the ADR margin, not defects under test ----

// An unannotated fallback handler infers T and E from the handler alone —
// here T binds to the literal 0 — so the mid-chain fallback does not widen
// the union to Error; it fails to compile outright. Annotating the handler
// (as pF above does) is what keeps the chain going.
// @ts-expect-error — Result<number, E4> is not assignable to Result<0, Error>
pipe(p4, fallback(() => success(0)), andThen(step(5)))

// Same at the head: seeding with success(0) (defaulted E = Error) puts a
// plain Error arm in the union that rides the whole chain.
const pSeedDefault = pipe(success(0), andThen(step(1)))
expectType<Result<number, Error | Err<1>>>()(pSeedDefault)
