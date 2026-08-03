import type { CurryableMapper, Mapper } from './types.js'

/**
 * identity always returns its argument.
 * @param t
 */
export function identity<T>(t: T): T {
  return t
}

/**
 * constant produces a function that always returns the given value.
 * @param t
 */
export function constant<T>(t: T): (..._: any[]) => T {
  return () => t
}

/**
 * compose combines two mappers to produce a mapper that performs both transformations in sequence
 * @param xToY the first mapper
 * @param yToZ the second mapper
 */
export function compose<X, Y, Z>(
  xToY: Mapper<X, Y>,
  yToZ: Mapper<Y, Z>,
): Mapper<X, Z>
export function compose<X, Y, Z>(
  xToY: Mapper<X, Y>,
  yToZ: Mapper<Y, Z>,
  x: X,
): Z
export function compose<X, Y, Z>(
  xToY: Mapper<X, Y>,
  yToZ: Mapper<Y, Z>,
  x?: X,
): CurryableMapper<X, Z> {
  return curry((x) => yToZ(xToY(x)), x)
}

/**
 * curry produces a CurryableMapper by either returning or applying a Mapper
 * depending on the presence of the input
 */
export function curry<T, U>(
  mapper: Mapper<T, U>,
  input?: T,
): CurryableMapper<T, U> {
  return input !== undefined ? mapper(input as T) : mapper
}
