export type Function<
  Return extends unknown = unknown,
  Args extends unknown[] = unknown[],
> = (...args: Args) => Return

export function compose<A, B, C>(
  f: Function<C, [B]>,
  g: Function<B, [A]>,
): Function<C, [A]> {
  return (x: A) => f(g(x))
}
