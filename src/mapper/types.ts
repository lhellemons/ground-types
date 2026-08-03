/**
 * Mapper is any function that transforms a single argument into a single return value
 */
export type Mapper<T, U> = (t: T) => U
/**
 * CurryableMapper is the return type of any function that can either
 * produce a Mapper, or serve as a Mapper itself.
 */
export type CurryableMapper<T, U> = Mapper<T, U> | U
