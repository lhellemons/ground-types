/** A function of concrete argument tuple `Args` returning `Return`. */
export type Fn<
  Return extends unknown = unknown,
  Args extends unknown[] = unknown[],
> = (...args: Args) => Return

/**
 * A function of exactly one argument: the unary special case of
 * {@link Fn}, and the shape every combinator in this library composes
 * over. `Mapper<T, U>` and `Fn<U, [T]>` are the same type; prefer
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
export function compose<A, B, C>(f: Fn<C, [B]>, g: Fn<B, [A]>): Fn<C, [A]> {
  return (x: A) => f(g(x))
}

/**
 * Runs `value` through a sequence of {@link Mapper}s left to right: `pipe(x,
 * f, g)` is `g(f(x))`, so the steps read in the order the data flows through
 * them — the mirror of {@link compose}, which reads right to left.
 *
 * Always applies immediately; there is no deferred form. Each step's
 * parameter type is pinned to the previous step's return type, so a step
 * that doesn't fit its neighbour is a compile error at that step, not a
 * silent `unknown`.
 */
export function pipe<A, B>(value: A, f1: Mapper<A, B>): B
export function pipe<A, B, C>(value: A, f1: Mapper<A, B>, f2: Mapper<B, C>): C
export function pipe<A, B, C, D>(
  value: A,
  f1: Mapper<A, B>,
  f2: Mapper<B, C>,
  f3: Mapper<C, D>,
): D
export function pipe<A, B, C, D, E>(
  value: A,
  f1: Mapper<A, B>,
  f2: Mapper<B, C>,
  f3: Mapper<C, D>,
  f4: Mapper<D, E>,
): E
export function pipe<A, B, C, D, E, F>(
  value: A,
  f1: Mapper<A, B>,
  f2: Mapper<B, C>,
  f3: Mapper<C, D>,
  f4: Mapper<D, E>,
  f5: Mapper<E, F>,
): F
export function pipe<A, B, C, D, E, F, G>(
  value: A,
  f1: Mapper<A, B>,
  f2: Mapper<B, C>,
  f3: Mapper<C, D>,
  f4: Mapper<D, E>,
  f5: Mapper<E, F>,
  f6: Mapper<F, G>,
): G
export function pipe<A, B, C, D, E, F, G, H>(
  value: A,
  f1: Mapper<A, B>,
  f2: Mapper<B, C>,
  f3: Mapper<C, D>,
  f4: Mapper<D, E>,
  f5: Mapper<E, F>,
  f6: Mapper<F, G>,
  f7: Mapper<G, H>,
): H
export function pipe<A, B, C, D, E, F, G, H, I>(
  value: A,
  f1: Mapper<A, B>,
  f2: Mapper<B, C>,
  f3: Mapper<C, D>,
  f4: Mapper<D, E>,
  f5: Mapper<E, F>,
  f6: Mapper<F, G>,
  f7: Mapper<G, H>,
  f8: Mapper<H, I>,
): I
export function pipe<A, B, C, D, E, F, G, H, I, J>(
  value: A,
  f1: Mapper<A, B>,
  f2: Mapper<B, C>,
  f3: Mapper<C, D>,
  f4: Mapper<D, E>,
  f5: Mapper<E, F>,
  f6: Mapper<F, G>,
  f7: Mapper<G, H>,
  f8: Mapper<H, I>,
  f9: Mapper<I, J>,
): J
export function pipe<A, B, C, D, E, F, G, H, I, J, K>(
  value: A,
  f1: Mapper<A, B>,
  f2: Mapper<B, C>,
  f3: Mapper<C, D>,
  f4: Mapper<D, E>,
  f5: Mapper<E, F>,
  f6: Mapper<F, G>,
  f7: Mapper<G, H>,
  f8: Mapper<H, I>,
  f9: Mapper<I, J>,
  f10: Mapper<J, K>,
): K
export function pipe(
  value: unknown,
  ...fns: Mapper<unknown, unknown>[]
): unknown {
  return fns.reduce((acc, fn) => fn(acc), value)
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
