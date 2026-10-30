import type { Account } from './account'
import { supabase } from './supabase'

// Daily reminders on this device (docs/plans/notifications.md): its push
// subscription, and its row in push_subscriptions, from which the server
// sends the reminder. This isn't synced data: there's no Dexie table and
// nothing in backups, and the row is written straight to Supabase rather
// than through writing().

// The public half of the key that signs the pushes, set at build time like
// the Supabase URL. Without it, or without Supabase, there are no reminders.
const vapidPublicKey: string | undefined = import.meta.env.VITE_VAPID_PUBLIC_KEY

// 'HH:MM', 24-hour, in the device's own time zone.
export type ReminderTime = string

export const DEFAULT_REMINDER_TIME: ReminderTime = '08:00'

export type NotificationStatus =
  // This build has no Supabase project or push key.
  | { state: 'unavailable' }
  | { state: 'signed-out' }
  // Opened from a plain http address, such as npm run dev:phone's:
  // browsers only allow push on secure (https) ones.
  | { state: 'insecure' }
  // An iPhone or iPad Safari tab: push only exists in Home Screen apps.
  | { state: 'needs-home-screen' }
  // A Home Screen app on iOS before 16.4, which has no push.
  | { state: 'update-ios' }
  | { state: 'unsupported' }
  | { state: 'blocked' }
  | { state: 'off' }
  | { state: 'on'; time: ReminderTime }

const SERVICE_WORKER = './sw.js'

export function notificationsAvailable(): boolean {
  return Boolean(supabase && vapidPublicKey)
}

// Keeps the service worker that shows reminders installed and up to date.
// Called once, at startup.
export function registerServiceWorker(): void {
  if (!notificationsAvailable() || !('serviceWorker' in navigator)) return
  navigator.serviceWorker.register(SERVICE_WORKER).catch((error: unknown) => {
    console.warn('The service worker for reminders did not register:', error)
  })
}

// What this browser can do about push. Over plain http there's none at all
// (no service worker either). On iOS, a Safari tab has navigator.standalone
// false and no PushManager; the Home Screen app has both from iOS 16.4.
export function pushSupport({
  secure,
  hasPush,
  standalone,
}: {
  secure: boolean
  hasPush: boolean
  standalone: boolean | undefined
}): 'ok' | 'insecure' | 'needs-home-screen' | 'update-ios' | 'unsupported' {
  if (!secure) return 'insecure'
  if (hasPush) return 'ok'
  if (standalone === false) return 'needs-home-screen'
  if (standalone === true) return 'update-ios'
  return 'unsupported'
}

export async function notificationStatus(account: Account): Promise<NotificationStatus> {
  if (!supabase || !notificationsAvailable()) return { state: 'unavailable' }
  if (account.state !== 'signed-in') return { state: 'signed-out' }
  const support = browserPushSupport()
  if (support !== 'ok') return { state: support }
  if (Notification.permission === 'denied') return { state: 'blocked' }
  const subscription = await currentSubscription()
  if (!subscription || Notification.permission !== 'granted') return { state: 'off' }
  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('remind_at')
    .eq('endpoint', subscription.endpoint)
    .maybeSingle()
  if (error) throw new Error(`Couldn't check reminders: ${error.message}`)
  // No row: the server forgot an address the push service had dropped, or
  // an earlier turn-off removed the row while the subscription stayed.
  return data ? { state: 'on', time: toReminderTime(data.remind_at as string) } : { state: 'off' }
}

// Asks for permission first, straight from the tap: iOS only shows its
// prompt in response to one, so nothing may be awaited before it.
export async function turnOnNotifications(time: ReminderTime): Promise<NotificationStatus> {
  const permission = await Notification.requestPermission()
  if (permission === 'denied') return { state: 'blocked' }
  if (permission !== 'granted') return { state: 'off' }
  if (!supabase || !vapidPublicKey) return { state: 'unavailable' }

  await navigator.serviceWorker.register(SERVICE_WORKER)
  const registration = await navigator.serviceWorker.ready
  // A fresh subscription each time: an old one may be an address the push
  // service has dropped.
  await (await registration.pushManager.getSubscription())?.unsubscribe()
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToBytes(vapidPublicKey),
  })
  const { endpoint, keys } = subscription.toJSON()
  if (!endpoint || !keys?.p256dh || !keys.auth) {
    await subscription.unsubscribe()
    throw new Error("This browser didn't give a complete push address.")
  }
  const { error } = await supabase.from('push_subscriptions').insert({
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    time_zone: deviceTimeZone(),
    remind_at: time,
  })
  if (error) {
    await subscription.unsubscribe()
    throw new Error(`Couldn't turn on reminders: ${error.message}`)
  }
  return { state: 'on', time }
}

// A new time starts the day afresh: a reminder already sent today comes
// again at the new time.
export async function setReminderTime(time: ReminderTime): Promise<void> {
  const subscription = await currentSubscription()
  if (!supabase || !subscription) return
  const { error } = await supabase
    .from('push_subscriptions')
    .update({ remind_at: time, last_sent_on: null })
    .eq('endpoint', subscription.endpoint)
  if (error) throw new Error(`Couldn't change the reminder time: ${error.message}`)
}

// Removes this device's row, then its subscription. If the server can't be
// reached, the subscription goes anyway: the push service then answers
// "gone" to the next reminder, and the server forgets the row itself.
export async function turnOffNotifications(): Promise<void> {
  const subscription = await currentSubscription()
  if (!subscription) return
  if (supabase) {
    await supabase
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', subscription.endpoint)
      .then(
        () => {},
        () => {},
      )
  }
  await subscription.unsubscribe().catch(() => false)
}

// Signed in, at startup: brings this device's time zone up to date, so
// travel doesn't shift the reminder. A row the server removed stays removed.
export async function refreshNotifications(): Promise<void> {
  if (!supabase || !notificationsAvailable() || browserPushSupport() !== 'ok') return
  const subscription = await currentSubscription()
  if (!subscription) return
  const zone = deviceTimeZone()
  await supabase
    .from('push_subscriptions')
    .update({ time_zone: zone })
    .eq('endpoint', subscription.endpoint)
    .neq('time_zone', zone)
}

// '08:00:00', as Postgres returns a time, to '08:00'.
export function toReminderTime(value: string): ReminderTime {
  return value.slice(0, 5)
}

function browserPushSupport() {
  return pushSupport({
    secure: window.isSecureContext,
    hasPush: 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window,
    standalone: (navigator as Navigator & { standalone?: boolean }).standalone,
  })
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null
  const registration = await navigator.serviceWorker.getRegistration()
  return (await registration?.pushManager?.getSubscription()) ?? null
}

function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

function base64UrlToBytes(text: string): Uint8Array<ArrayBuffer> {
  const base64 = text.replaceAll('-', '+').replaceAll('_', '/')
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
}
