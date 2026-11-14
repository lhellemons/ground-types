import { afterEach, describe, expect, it, vi } from 'vitest'
import { InternRegistry, internByKey } from './index.js'
import { isJust, isNothing } from '../maybe/index.js'
import type { CompoundValueObject } from '../domain/index.js'

describe('InternRegistry', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('recreates collected values and ignores late cleanup of older entries', () => {
    const refs: { value: object | undefined }[] = []
    const registrations: { key: string; ref: WeakRef<object> }[] = []
    let cleanup!: (entry: { key: string; ref: WeakRef<object> }) => void
    vi.stubGlobal(
      'WeakRef',
      class {
        readonly slot: { value: object | undefined }
        constructor(value: object) {
          this.slot = { value }
          refs.push(this.slot)
        }
        deref() {
          return this.slot.value
        }
      },
    )
    vi.stubGlobal(
      'FinalizationRegistry',
      class {
        constructor(callback: typeof cleanup) {
          cleanup = callback
        }
        register(_value: object, entry: (typeof registrations)[number]) {
          registrations.push(entry)
        }
      },
    )
    const registry = new InternRegistry<string, object>()
    registry.getOrCreate('a', () => ({}))
    refs[0].value = undefined
    expect(registry.get('a')).toBeUndefined()
    const replacement = registry.getOrCreate('a', () => ({}))
    cleanup(registrations[0])
    expect(registry.get('a')).toBe(replacement)
    refs[1].value = undefined
    cleanup(registrations[1])
    expect(registry.get('a')).toBeUndefined()
    expect(registry.getOrCreate('a', () => ({}))).not.toBe(replacement)
  })

  it('creates a value on first access', () => {
    const registry = new InternRegistry<string, { id: string }>()
    let calls = 0
    const value = registry.getOrCreate('a', () => {
      calls++
      return { id: 'a' }
    })
    expect(value).toEqual({ id: 'a' })
    expect(calls).toBe(1)
  })

  it('returns the same reference on a second call, without recreating', () => {
    const registry = new InternRegistry<string, { id: string }>()
    const first = registry.getOrCreate('a', () => ({ id: 'a' }))
    let calls = 0
    const second = registry.getOrCreate('a', () => {
      calls++
      return { id: 'a' }
    })
    expect(second).toBe(first)
    expect(calls).toBe(0)
  })

  it('get returns Nothing for an unknown key', () => {
    const registry = new InternRegistry<string, { value: number }>()
    expect(isNothing(registry.get('missing'))).toBe(true)
  })

  it('get returns Just the interned value for a known key', () => {
    const registry = new InternRegistry<string, { value: number }>()
    const value = registry.getOrCreate('a', () => ({ value: 42 }))
    const found = registry.get('a')
    expect(isJust(found)).toBe(true)
    expect(found).toBe(value)
  })
})

type Point = CompoundValueObject<string> & {
  readonly x: number
  readonly y: number
}

describe('internByKey', () => {
  it('interns the created value under its own key', () => {
    const registry = new InternRegistry<string, Point>()
    const point = internByKey(registry, '1,2', () => ({
      key: '1,2',
      x: 1,
      y: 2,
    }))
    expect(point).toEqual({ key: '1,2', x: 1, y: 2 })
  })

  it('returns the same reference on a second call, without recreating', () => {
    const registry = new InternRegistry<string, Point>()
    const first = internByKey(registry, '1,2', () => ({
      key: '1,2',
      x: 1,
      y: 2,
    }))
    let calls = 0
    const second = internByKey(registry, '1,2', () => {
      calls++
      return { key: '1,2', x: 1, y: 2 }
    })
    expect(second).toBe(first)
    expect(calls).toBe(0)
  })

  it('throws if the created value is keyed differently than the interning key', () => {
    const registry = new InternRegistry<string, Point>()
    expect(() =>
      internByKey(registry, '1,2', () => ({ key: 'wrong', x: 1, y: 2 })),
    ).toThrow(/key/i)
  })

  it('does not throw when the key is NaN and matches, since Map treats NaN as equal to itself', () => {
    type NanPoint = CompoundValueObject<number> & { readonly label: string }
    const registry = new InternRegistry<number, NanPoint>()
    const value = internByKey(registry, NaN, () => ({
      key: NaN,
      label: 'origin',
    }))
    expect(value).toEqual({ key: NaN, label: 'origin' })
  })
})
