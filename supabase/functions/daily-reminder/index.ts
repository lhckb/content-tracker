// The daily-reminder Edge Function (docs/plans/notifications.md). The
// database's scheduled job calls it in a minute when some device's reminder
// is due, and it sends each due device its sentence through web push.
//
// Deploy it with the JWT check off: the job sends the reminder token, which
// handleReminderRequest checks, because Supabase's new keys aren't JWTs.
// Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and REMINDER_TOKEN (made by
// scripts/notification-keys.mjs). Supabase provides SUPABASE_URL and the
// project's secret key.
import { createClient } from '@supabase/supabase-js'
// web-push has no types of its own.
// @ts-types="npm:@types/web-push@3.6.4"
import webpush from 'web-push'
import { handleReminderRequest, type DueDevice } from './reminders.ts'

// The contact address push services ask senders for: the live site rather
// than an email address.
const SUBJECT = 'https://lhckb.github.io/content-tracker/'
// A reminder the device couldn't receive within 6 hours is dropped, so a
// morning one doesn't arrive at night.
const TTL_SECONDS = 6 * 60 * 60

Deno.serve(async (request) => {
  try {
    return await handleReminderRequest(request, {
      token: Deno.env.get('REMINDER_TOKEN'),
      async claim() {
        const { data, error } = await database().rpc('claim_due_reminders')
        if (error) throw new Error(`claim_due_reminders: ${error.message}`)
        return data as DueDevice[]
      },
      async send(subscription, payload) {
        webpush.setVapidDetails(SUBJECT, secret('VAPID_PUBLIC_KEY'), secret('VAPID_PRIVATE_KEY'))
        // The topic lets a newer reminder replace one still waiting for the
        // device.
        await webpush.sendNotification(subscription, payload, {
          TTL: TTL_SECONDS,
          urgency: 'normal',
          topic: 'daily-reminder',
        })
      },
      async forget(endpoints) {
        const { error } = await database().rpc('forget_push_subscriptions', { endpoints })
        if (error) throw new Error(`forget_push_subscriptions: ${error.message}`)
      },
      log: (message) => console.warn(message),
    })
  } catch (error) {
    console.error(error)
    return new Response('Internal error', { status: 500 })
  }
})

// Supabase's own copy of the project's secret key, which the two functions
// above require. It never leaves Supabase's environment.
function database() {
  return createClient(secret('SUPABASE_URL'), secretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

// SUPABASE_SECRET_KEYS holds the new secret keys by name, as JSON; older
// projects only have the legacy service-role key.
function secretKey(): string {
  const keys = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (keys) {
    const parsed = JSON.parse(keys) as Record<string, string>
    const key = parsed.default ?? Object.values(parsed)[0]
    if (key) return key
  }
  return secret('SUPABASE_SERVICE_ROLE_KEY')
}

function secret(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`The ${name} secret isn't set.`)
  return value
}
