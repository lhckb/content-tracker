import { describe, expect, it } from 'vitest'
import { describeSync } from './syncText'

describe('describeSync', () => {
  const now = Date.parse('2026-10-27T12:00:00Z')
  const synced = (at: string) => describeSync({ state: 'synced', at }, now)

  it('says how long ago the last sync was', () => {
    expect(synced('2026-10-27T11:59:30Z')).toBe('Synced just now')
    expect(synced('2026-10-27T11:58:00Z')).toBe('Synced 2 min ago')
    expect(synced('2026-10-27T10:30:00Z')).toBe('Synced 1 hour ago')
    expect(synced('2026-10-27T07:00:00Z')).toBe('Synced 5 hours ago')
  })

  it('explains offline and errors without alarming', () => {
    expect(describeSync({ state: 'offline' })).toMatch(/when you're back online/)
    expect(describeSync({ state: 'error', message: 'Failed to fetch' })).toMatch(/kept on this device/)
  })
})
