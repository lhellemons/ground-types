export type Maybe<T> = T extends undefined ? never : T | undefined
export type Just<T> = T extends undefined ? never : T
export type Nothing<T> = T extends undefined ? never : undefined

export function maybe<T>(value: T | undefined): Maybe<T> {
  return value as Maybe<T>
}
export function just<T>(value: T): Just<T> {
  return value as Just<T>
}
export function nothing<T>(): Nothing<T> {
  return undefined as Nothing<T>
}

export function isJust<T>(value: Maybe<T>): value is Just<T> {
  return value !== undefined
}
export function isNothing<T>(value: Maybe<T>): value is Nothing<T> {
  return value === undefined
}

export function orElse<T>(defaultValue: T): (value: Maybe<T>) => Just<T> {
  return (value: Maybe<T>) => (isJust(value) ? value : defaultValue) as Just<T>
}

export function map<T, U>(
  fn: (value: Just<T>) => U,
): (value: Maybe<T>) => Maybe<U> {
  return (value: Maybe<T>) => (isJust(value) ? maybe(fn(value)) : nothing())
}

export function flatten<T>(value: Maybe<Maybe<T>>): Maybe<T> {
  return value as unknown as Maybe<T>
}

export function flatMap<T, U>(
  fn: (value: Just<T>) => Maybe<U>,
): (value: Maybe<T>) => Maybe<U> {
  return (value) => flatten(map(fn)(value))
}
