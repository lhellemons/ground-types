/** A function of concrete argument tuple `Args` returning `Return`. */
export type Function<
  Return extends unknown = unknown,
  Args extends unknown[] = unknown[],
> = (...args: Args) => Return

/**
 * Composes two unary functions right to left: `compose(f, g)(x)` is
 * `f(g(x))`. Not commutative — order matters.
 */
export function compose<A, B, C>(
  f: Function<C, [B]>,
  g: Function<B, [A]>,
): Function<C, [A]> {
  return (x: A) => f(g(x))
}
