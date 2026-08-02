import { maybe } from '../maybe/index.js'
import type { Maybe } from '../maybe/index.js'

export class InternRegistry<K, V> {
  readonly #map = new Map<K, V>()

  getOrCreate(key: K, create: () => V): V {
    const existing = this.#map.get(key)
    if (existing !== undefined) return existing
    const value = create()
    this.#map.set(key, value)
    return value
  }

  get(key: K): Maybe<V> {
    return maybe(this.#map.get(key))
  }
}
