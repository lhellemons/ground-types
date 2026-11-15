/* PROTOTYPE #59 — throwaway, not part of the library. The three fan-in
   candidates from the ticket, plus the accumulating variant of A, written
   against the unboxed Result on main. Nothing in src/ imports this. */
import { isFailure } from '../../src/result/index.js'
import type { Failure, Result } from '../../src/result/index.js'
import type { ErrorOf, ValueOf } from '../../src/result/internal.js'

/* ------------------------------------------------------------------------ */
/* A. `collect`: a struct (or tuple, or list) combinator.                    */
/* ------------------------------------------------------------------------ */

/** Every part unboxed: `{ id: Result<PieceId, E1> }` reads as `{ id: PieceId }`,
 * `[Result<A, E1>, Result<B, E2>]` as `[A, B]`, `Result<P, E>[]` as `P[]`. */
export type Collected<P> = { -readonly [K in keyof P]: ValueOf<P[K]> }

/** The error union of every part, read through `ErrorOf`. On a list or
 * tuple `keyof P` also names `length` and the array methods; none of those
 * is an `Error`, so they contribute nothing. */
export type Failed<P> = ErrorOf<P[keyof P]>

/**
 * The first Failure among the parts, or the parts themselves. The parts are
 * already unboxed, so on success `collect` returns its argument: no result
 * object is built and nothing is caught. The parts are evaluated by the caller,
 * eagerly, before `collect` runs, so a part cannot depend on another part.
 */
export function collect<
  const P extends Readonly<Record<string, unknown>> | readonly unknown[],
>(parts: P): Result<Collected<P>, Failed<P>> {
  for (const part of Array.isArray(parts) ? parts : Object.values(parts)) {
    if (isFailure(part)) return part as Failure<Collected<P>, Failed<P>>
  }
  return parts as Result<Collected<P>, never>
}

/** Every failed part, in part order. Still an `Error`, so it fits the
 * unboxed encoding as any other Failure does. */
export class Failures<E extends Error = Error> extends AggregateError {
  declare readonly errors: E[]
  constructor(errors: E[]) {
    super(errors, `${errors.length} of the parts failed`)
    this.name = 'Failures'
  }
}

/** A's accumulating variant: every Failure among the parts, as one
 * `Failures`, or the parts themselves. */
export function collectAll<
  const P extends Readonly<Record<string, unknown>> | readonly unknown[],
>(parts: P): Result<Collected<P>, Failures<Failed<P>>> {
  const failed: Failed<P>[] = []
  for (const part of Array.isArray(parts) ? parts : Object.values(parts)) {
    if (isFailure(part)) failed.push(part as Failed<P>)
  }
  if (failed.length > 0) {
    return new Failures(failed) as Failure<Collected<P>, Failures<Failed<P>>>
  }
  return parts as Result<Collected<P>, never>
}

/* ------------------------------------------------------------------------ */
/* B. `attempt`/`take`: slider's idiom made safe by a private token.         */
/* ------------------------------------------------------------------------ */

/** Unboxes a part, or leaves the `attempt` that handed it out. A part whose
 * error is outside `E` is rejected at the call. */
export type Take<E extends Error> = <R extends Result<unknown, E>>(
  part: R,
) => ValueOf<R>

/* One token per `attempt` call, compared by identity: a `take` from an
   enclosing `attempt` that is still running throws a token this one does
   not recognise, so it leaves that one; a `take` called after its own
   `attempt` has returned throws the token to its caller; every other throw
   is a bug and propagates as one. */
class Bail {
  failure: Error | undefined
}

/**
 * Runs `body` with a `take` that leaves on the first Failure. Only that
 * leave is caught; any other throw propagates. `E` has no inference site
 * of its own; see the probes for where TypeScript finds it.
 */
export function attempt<T, E extends Error>(
  body: (take: Take<E>) => T,
): Result<T, E> {
  const bail = new Bail()
  const take: Take<E> = (part) => {
    if (isFailure(part)) {
      bail.failure = part
      throw bail
    }
    return part as ValueOf<typeof part>
  }
  try {
    return body(take) as Result<T, E>
  } catch (thrown) {
    if (thrown === bail) return bail.failure as Failure<T, E>
    throw thrown
  }
}

/* ------------------------------------------------------------------------ */
/* C. `gen`/`yield* take`: do-notation on a generator.                       */
/* ------------------------------------------------------------------------ */

/**
 * Unboxes a part inside `gen`: `yield* take(part)` is the part's value, or
 * leaves the `gen` with the Failure. A throwaway generator, because an
 * unboxed value cannot be `yield*`-ed on its own. The failure is yielded
 * once; `gen` never resumes it.
 */
export function* take<R extends Result<unknown, Error>>(
  part: R,
): Generator<ErrorOf<R>, ValueOf<R>, unknown> {
  if (isFailure(part)) yield part as ErrorOf<R>
  return part as ValueOf<R>
}

/**
 * Drives a generator body to its return, or to its first yielded Failure.
 * Nothing is caught: a throw in the body propagates. On a Failure the
 * generator is closed with `return()`, so `finally` blocks in the body run.
 */
export function gen<T, Y extends Error>(
  body: () => Generator<Y, T, unknown>,
): Result<T, Y> {
  const it = body()
  const step = it.next()
  if (step.done) return step.value as Result<T, Y>
  ;(it as Generator<Y, unknown, unknown>).return(undefined)
  return step.value as Failure<T, Y>
}
