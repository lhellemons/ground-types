import { maybe } from '../maybe/index.js'
import type { Maybe } from '../maybe/index.js'

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
