import { describe, expect, it } from 'vitest'
import { notificationStatus, notificationsAvailable, pushSupport, toReminderTime } from './notifications'

describe('notifications', () => {
  it('can be turned on where the browser has push', () => {
    expect(pushSupport({ secure: true, hasPush: true, standalone: undefined })).toBe('ok')
    // The iPhone's Home Screen app.
    expect(pushSupport({ secure: true, hasPush: true, standalone: true })).toBe('ok')
  })

  it('needs a secure address first, even in the Home Screen app', () => {
    // npm run dev:phone's http address, added to the Home Screen.
    expect(pushSupport({ secure: false, hasPush: false, standalone: true })).toBe('insecure')
    expect(pushSupport({ secure: false, hasPush: false, standalone: undefined })).toBe('insecure')
  })

  it('points an iPhone Safari tab to the Home Screen app', () => {
    expect(pushSupport({ secure: true, hasPush: false, standalone: false })).toBe('needs-home-screen')
  })

  it('asks for a newer iOS in a Home Screen app without push', () => {
    expect(pushSupport({ secure: true, hasPush: false, standalone: true })).toBe('update-ios')
  })

  it('says other browsers without push simply can not', () => {
    expect(pushSupport({ secure: true, hasPush: false, standalone: undefined })).toBe('unsupported')
  })

  it('reads the time Postgres returns as HH:MM', () => {
    expect(toReminderTime('08:00:00')).toBe('08:00')
    expect(toReminderTime('23:30')).toBe('23:30')
  })

  it('is unavailable in a build without Supabase or a push key', async () => {
    expect(notificationsAvailable()).toBe(false)
    expect(await notificationStatus({ state: 'unavailable' })).toEqual({ state: 'unavailable' })
    expect(
      await notificationStatus({ state: 'signed-in', userId: 'u', email: 'a@example.com', name: 'A' }),
    ).toEqual({ state: 'unavailable' })
  })
})
