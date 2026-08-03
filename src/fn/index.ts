/** A function of concrete argument tuple `Args` returning `Return`. */
export type Function<Return = unknown, Args extends unknown[] = unknown[]> = (
  ...args: Args
) => Return

/**
 * A function of exactly one argument: the unary special case of
 * {@link Function}, and the shape every combinator in this library composes
 * over. `Mapper<T, U>` and `Function<U, [T]>` are the same type; prefer
 * `Mapper` in signatures, where naming the input first reads in the
 * direction the data flows.
 */
export type Mapper<T, U> = (t: T) => U

/**
 * The return type of a curryable function: either the {@link Mapper} itself,
 * when no input was supplied, or the mapped value, when one was. Callers see
 * one branch or the other through overloads; this union is the implementation
 * signature covering both, and is not meant to be narrowed at a call site —
 * when `U` is itself a function type, the two branches are indistinguishable.
 */
export type CurryableMapper<T, U> = Mapper<T, U> | U

/** Returns its argument unchanged, by reference. */
export function identity<T>(t: T): T {
  return t
}

/** Produces a function that ignores its arguments and always returns `t`. */
export function constant<T>(t: T): (..._: unknown[]) => T {
  return () => t
}

/**
 * Composes two unary functions right to left: `compose(f, g)(x)` is
 * `f(g(x))`. Not commutative — order matters. For the left-to-right reading,
 * see {@link pipe}.
 */
export function compose<A, B, C>(
  f: Function<C, [B]>,
  g: Function<B, [A]>,
): Function<C, [A]> {
  return (x: A) => f(g(x))
}

/**
 * Composes two {@link Mapper}s left to right: `pipe(f, g)(x)` is `g(f(x))`,
 * so the arguments read in the order the data flows through them. The mirror
 * of {@link compose}, which reads right to left — the two differ only in
 * argument order, so reaching for the wrong one applies the transformations
 * backwards rather than failing.
 *
 * Curryable: supply `x` to apply immediately, or omit it for the composed
 * `Mapper`.
 */
export function pipe<X, Y, Z>(
  xToY: Mapper<X, Y>,
  yToZ: Mapper<Y, Z>,
): Mapper<X, Z>
export function pipe<X, Y, Z>(xToY: Mapper<X, Y>, yToZ: Mapper<Y, Z>, x: X): Z
export function pipe<X, Y, Z>(
  xToY: Mapper<X, Y>,
  yToZ: Mapper<Y, Z>,
  ...x: [] | [X]
): CurryableMapper<X, Z> {
  return curry((x: X) => yToZ(xToY(x)), ...x)
}

/**
 * Produces a {@link CurryableMapper} by either applying `mapper` to an input
 * or returning `mapper` unapplied, depending on whether an input was given.
 * The building block every curryable export in this library delegates to.
 *
 * The input arrives as a rest tuple rather than an optional parameter so that
 * "was an argument passed?" is answered by arity and never by inspecting the
 * value. An `input === undefined` test cannot answer it in this library:
 * `Nothing` *is* `undefined`, so a present-but-absent Maybe would be
 * indistinguishable from a missing argument and would silently return the
 * mapper instead of applying it.
 *
 * Callers must forward their own arity the same way — `curry(mapper, input)`
 * where `input` is an optional parameter always passes two arguments, which
 * defeats the whole mechanism. Spread a `[] | [T]` rest tuple instead.
 */
export function curry<T, U>(
  mapper: Mapper<T, U>,
  ...input: [] | [T]
): CurryableMapper<T, U> {
  return input.length === 1 ? mapper(input[0]) : mapper
}
