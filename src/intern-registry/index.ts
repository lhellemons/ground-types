import { maybe } from '../maybe/index.js'
import type { Maybe } from '../maybe/index.js'
import type { CompoundValueObject } from '../domain/index.js'

/**
 * Canonicalises values by key so that equal values are represented by one
 * shared instance, making reference equality agree with value equality.
 * Instances are held weakly: a live instance is reused, while an instance
 * no longer held by callers may be collected and recreated on later access.
 * Keys are held strongly: a key that references its canonical instance
 * keeps that instance alive. Prefer identifier keys that do not reference
 * their canonical instances.
 */
export class InternRegistry<K, V extends object> {
  readonly #map = new Map<K, WeakRef<V>>()
  readonly #finalizer = new FinalizationRegistry<{ key: K; ref: WeakRef<V> }>(
    ({ key, ref }) => {
      if (this.#map.get(key) === ref) this.#map.delete(key)
    },
  )

  /**
   * Returns the canonical instance for `key`, creating and interning one
   * via `create` when no live instance exists. While the instance is live,
   * another call with the same `key` returns the exact same reference
   * without invoking `create` again.
   */
  getOrCreate(key: K, create: () => V): V {
    const existing = this.#map.get(key)?.deref()
    if (existing !== undefined) return existing
    const value = create()
    const ref = new WeakRef(value)
    this.#map.set(key, ref)
    this.#finalizer.register(value, { key, ref })
    return value
  }

  /**
   * Looks up the live canonical instance for `key` without creating one,
   * returning Nothing if it is absent or has been collected.
   */
  get(key: K): Maybe<V> {
    return maybe(this.#map.get(key)?.deref())
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
