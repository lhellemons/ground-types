import { maybe } from '../maybe/index.js'
import type { Maybe } from '../maybe/index.js'
import type { CompoundValueObject } from '../domain/index.js'

/**
 * Canonicalises values by key so that equal values are represented by one
 * shared instance, making reference equality agree with value equality.
 * Not a cache: entries are never evicted, and the point is identity of
 * equals, not avoiding recomputation.
 */
export class InternRegistry<K, V> {
  readonly #map = new Map<K, V>()

  /**
   * Returns the canonical instance for `key`, creating and interning one
   * via `create` on first access. A second call with the same `key` returns
   * the exact same reference without invoking `create` again.
   */
  getOrCreate(key: K, create: () => V): V {
    if (this.#map.has(key)) return this.#map.get(key) as V
    const value = create()
    this.#map.set(key, value)
    return value
  }

  /**
   * Looks up the canonical instance for `key` without creating one. If `V`
   * itself includes `undefined`, a key interned as `undefined` is
   * indistinguishable from a key that was never interned — inherent to
   * `Maybe`'s unboxed encoding, not a defect of this method. Use
   * `getOrCreate` when that distinction matters.
   */
  get(key: K): Maybe<V> {
    return maybe(this.#map.get(key))
  }
}

/**
 * Interns a {@link CompoundValueObject} in `registry` under `key`, the same
 * `key` the created value must carry as its own `key`; throws if `create`
 * returns a value keyed differently. Sameness is checked with the same
 * SameValueZero semantics `Map` (and so `InternRegistry`) uses for `K`, so
 * a `key` of `NaN` compares equal to itself.
 */
export function internByKey<K, V extends CompoundValueObject<K>>(
  registry: InternRegistry<K, V>,
  key: K,
  create: () => V,
): V {
  return registry.getOrCreate(key, () => {
    const value = create()
    if (!sameValueZero(value.key, key)) {
      throw new Error(
        `internByKey: created value's key (${String(value.key)}) does not match the interning key (${String(key)})`,
      )
    }
    return value
  })
}

function sameValueZero(a: unknown, b: unknown): boolean {
  return a === b || (a !== a && b !== b)
}
