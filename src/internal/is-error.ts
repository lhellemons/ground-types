/* Module-private, shared by `/result`, `/maybe`, `/promise` and `/abort`.
   Absent from the package's exports map: it ships in `dist` but a consumer
   cannot import it. It is a module of its own so that `/maybe` can use it
   without importing `/result` at runtime (see
   docs/adr/0001-unboxed-maybe-and-result.md). */

/* `Error.prototype`, and `isPrototypeOf` bound to `Function.prototype.call`,
   both captured when the module loads. */
const errorPrototype = Error.prototype
const isPrototypeOf: (prototype: object, value: unknown) => boolean =
  // eslint-disable-next-line @typescript-eslint/unbound-method -- bound at once
  Function.prototype.call.bind(Object.prototype.isPrototypeOf)

/* Whether `prototype` is on `value`'s prototype chain, by `isPrototypeOf` and
   never `instanceof`, so no `Symbol.hasInstance` is consulted. Throws for a
   value whose chain walk throws (a Proxy whose `getPrototypeOf` trap throws,
   a revoked Proxy); a caller that must not throw guards it. */
export function hasPrototype(prototype: object, value: unknown): boolean {
  return isPrototypeOf(prototype, value)
}

/* Whether `prototype` is `Error.prototype` or inherits from it. Throws like
   `hasPrototype`. */
export function isErrorPrototype(prototype: object): boolean {
  return (
    prototype === errorPrototype || isPrototypeOf(errorPrototype, prototype)
  )
}

/* Whether `Error.prototype` is on `value`'s prototype chain: the answer of
   `value instanceof Error`, but by `isPrototypeOf` and never `instanceof`, so
   `Error[Symbol.hasInstance]` is not consulted. A value on which the chain
   walk throws answers false instead. */
export function isError(value: unknown): value is Error {
  try {
    return isPrototypeOf(errorPrototype, value)
  } catch {
    return false
  }
}
