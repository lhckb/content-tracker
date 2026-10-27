import { afterEach, describe, expect, it, vi } from 'vitest'
import { newId } from './ids'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('newId', () => {
  it('makes version-4 UUIDs', () => {
    expect(newId()).toMatch(UUID_V4)
  })

  it('still works where crypto.randomUUID is missing (plain HTTP)', () => {
    const { getRandomValues } = crypto
    vi.stubGlobal('crypto', { getRandomValues: getRandomValues.bind(crypto) })
    const ids = new Set(Array.from({ length: 100 }, newId))
    expect([...ids].every((id) => UUID_V4.test(id))).toBe(true)
    expect(ids.size).toBe(100)
  })
})
