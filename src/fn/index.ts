/** A function of concrete argument tuple `Args` returning `Return`. */
export type Fn<Return = unknown, Args extends unknown[] = unknown[]> = (
  ...args: Args
) => Return

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
 * when no input was supplied, or the mapped value, when one was. This is the
 * extension point for writing your own curryable combinator — pair it with
 * {@link curry} the way `promise/resultify` and `call/resultify` do. See
 * {@link curry} for the worked example and the arity rule that makes it safe.
 *
 * A `CurryableMapper` is an implementation-signature type, meant for a
 * function's return type, not for narrowing at a call site: callers see one
 * branch or the other through your overloads (mirror `resultify`'s two-overload
 * shape), and when `U` is itself a function type — as it is for
 * `call/resultify`, whose `U` is a `Call` — the two branches are
 * indistinguishable to both the compiler and the reader, so there is nothing
 * to narrow to.
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
 * Composes {@link Mapper}s right to left: `compose(f, g)(x)` is `f(g(x))` —
 * the last argument runs first, and the first argument's return value is the
 * result. Not commutative — order matters. Builds a reusable Mapper with no
 * value in hand yet; the mirror of {@link pipe}, which reads left to right
 * and always applies immediately.
 *
 * Typed up to ten Mappers, each an explicit overload naming its own chain of
 * type parameters, so every step's parameter type is pinned to its
 * neighbour's return type — a step that doesn't fit is a compile error at
 * that step, not a silent `unknown`.
 *
 * A step whose own type is still generic after being called — as
 * `result/map` and `result/andThen`'s deferred forms are, by design, so they
 * accept a narrower `Result` than they were configured for — needs an
 * explicit `Mapper<T, U>` annotation to compose with. `compose` has no value
 * in the call for TypeScript to anchor inference against the way {@link
 * pipe} does; the annotation does that job instead. See the mixed
 * maybe/result chain in `src/fn/index.test-d.ts` for a worked example.
 */
export function compose<A, B, C>(f1: Fn<C, [B]>, f2: Fn<B, [A]>): Fn<C, [A]>
export function compose<A, B, C, D>(
  f1: Fn<D, [C]>,
  f2: Fn<C, [B]>,
  f3: Fn<B, [A]>,
): Fn<D, [A]>
export function compose<A, B, C, D, E>(
  f1: Fn<E, [D]>,
  f2: Fn<D, [C]>,
  f3: Fn<C, [B]>,
  f4: Fn<B, [A]>,
): Fn<E, [A]>
export function compose<A, B, C, D, E, F>(
  f1: Fn<F, [E]>,
  f2: Fn<E, [D]>,
  f3: Fn<D, [C]>,
  f4: Fn<C, [B]>,
  f5: Fn<B, [A]>,
): Fn<F, [A]>
export function compose<A, B, C, D, E, F, G>(
  f1: Fn<G, [F]>,
  f2: Fn<F, [E]>,
  f3: Fn<E, [D]>,
  f4: Fn<D, [C]>,
  f5: Fn<C, [B]>,
  f6: Fn<B, [A]>,
): Fn<G, [A]>
export function compose<A, B, C, D, E, F, G, H>(
  f1: Fn<H, [G]>,
  f2: Fn<G, [F]>,
  f3: Fn<F, [E]>,
  f4: Fn<E, [D]>,
  f5: Fn<D, [C]>,
  f6: Fn<C, [B]>,
  f7: Fn<B, [A]>,
): Fn<H, [A]>
export function compose<A, B, C, D, E, F, G, H, I>(
  f1: Fn<I, [H]>,
  f2: Fn<H, [G]>,
  f3: Fn<G, [F]>,
  f4: Fn<F, [E]>,
  f5: Fn<E, [D]>,
  f6: Fn<D, [C]>,
  f7: Fn<C, [B]>,
  f8: Fn<B, [A]>,
): Fn<I, [A]>
export function compose<A, B, C, D, E, F, G, H, I, J>(
  f1: Fn<J, [I]>,
  f2: Fn<I, [H]>,
  f3: Fn<H, [G]>,
  f4: Fn<G, [F]>,
  f5: Fn<F, [E]>,
  f6: Fn<E, [D]>,
  f7: Fn<D, [C]>,
  f8: Fn<C, [B]>,
  f9: Fn<B, [A]>,
): Fn<J, [A]>
export function compose<A, B, C, D, E, F, G, H, I, J, K>(
  f1: Fn<K, [J]>,
  f2: Fn<J, [I]>,
  f3: Fn<I, [H]>,
  f4: Fn<H, [G]>,
  f5: Fn<G, [F]>,
  f6: Fn<F, [E]>,
  f7: Fn<E, [D]>,
  f8: Fn<D, [C]>,
  f9: Fn<C, [B]>,
  f10: Fn<B, [A]>,
): Fn<K, [A]>
export function compose(
  ...fns: Fn<unknown, [unknown]>[]
): Fn<unknown, [unknown]> {
  return (x: unknown) => fns.reduceRight((acc, fn) => fn(acc), x)
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
 * The building block every curryable export in this library delegates to —
 * `promise/resultify` and `call/resultify` are both `curry` underneath — and
 * the sanctioned way to give your own combinator the same "apply now, or hand
 * back a Mapper for later" shape.
 *
 * Writing one means three parts, all present on `resultify`: two public
 * overloads (applied form, then deferred form), an implementation signature
 * whose trailing parameter is a `[] | [T]` rest tuple, and a body that spreads
 * that tuple into `curry`:
 *
 * ```ts
 * function scaleBy(factor: number, input: number): number
 * function scaleBy(factor: number): Mapper<number, number>
 * function scaleBy(
 *   factor: number,
 *   ...input: [] | [number]
 * ): CurryableMapper<number, number> {
 *   return curry((n: number) => n * factor, ...input)
 * }
 *
 * scaleBy(2, 21) // 42, applied now
 * scaleBy(2) // Mapper<number, number>, applied later
 * ```
 *
 * The input arrives as a rest tuple rather than an optional parameter so that
 * "was an argument passed?" is answered by arity and never by inspecting the
 * value. An `input === undefined` test cannot answer it in this library:
 * `Nothing` *is* `undefined`, so a present-but-absent Maybe would be
 * indistinguishable from a missing argument and would silently return the
 * mapper instead of applying it. This is not a hypothetical for your own
 * combinator either, the moment its `T` can be `undefined` the same trap is
 * live — which is exactly why `curry` takes arity, not a value, and why your
 * wrapper must forward arity the same way.
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
