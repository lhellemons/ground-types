import { describe, expect, it } from 'vitest'
import { InternRegistry, internByKey } from './index.js'
import { isJust, isNothing } from '../maybe/index.js'
import type { CompoundValueObject } from '../domain/index.js'

describe('InternRegistry', () => {
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
    const registry = new InternRegistry<string, number>()
    expect(isNothing(registry.get('missing'))).toBe(true)
  })

  it('get returns Just the interned value for a known key', () => {
    const registry = new InternRegistry<string, number>()
    registry.getOrCreate('a', () => 42)
    const found = registry.get('a')
    expect(isJust(found)).toBe(true)
    expect(found).toBe(42)
  })

  it('interns undefined without recreating on a second call', () => {
    const registry = new InternRegistry<string, number | undefined>()
    let calls = 0
    registry.getOrCreate('a', () => {
      calls++
      return undefined
    })
    registry.getOrCreate('a', () => {
      calls++
      return undefined
    })
    expect(calls).toBe(1)
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
