import { describe, expect, it } from 'vitest'
import * as domain from '../../src/domain/index.js'

describe('/domain runtime exports', () => {
  it('exports DomainError at runtime', () => {
    expect(Object.keys(domain)).toEqual(['DomainError'])
  })
})
