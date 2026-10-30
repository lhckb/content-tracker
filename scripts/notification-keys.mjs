// Makes what one Supabase project needs for daily reminders
// (docs/plans/notifications.md): a VAPID key pair, which signs the pushes,
// and the token the database's scheduled job sends the daily-reminder
// function. Run it once per project. The private values only pass through
// this terminal, on their way to the Supabase dashboard.
//
// Usage: node scripts/notification-keys.mjs https://<project-ref>.supabase.co
import { generateKeyPairSync, randomBytes } from 'node:crypto'

const projectUrl = process.argv[2]?.replace(/\/+$/, '')
if (!projectUrl || !/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(projectUrl)) {
  console.error('Usage: node scripts/notification-keys.mjs https://<project-ref>.supabase.co')
  process.exit(1)
}

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
const { x, y } = publicKey.export({ format: 'jwk' })
const { d } = privateKey.export({ format: 'jwk' })
// Push services take the public key as the uncompressed point (0x04, x, y)
// and the private key as its 32 bytes, both base64url.
const vapidPublic = Buffer.concat([Buffer.from([4]), Buffer.from(x, 'base64url'), Buffer.from(y, 'base64url')]).toString(
  'base64url',
)
const token = randomBytes(32).toString('base64url')

console.log(`Daily reminders for ${projectUrl}

1. The app's build variable (public):

   VITE_VAPID_PUBLIC_KEY=${vapidPublic}

   Dev: add it to .env.local, then restart the dev server.
   Production: a GitHub Actions variable of that name (Settings, Secrets
   and variables, Actions, Variables).

2. The daily-reminder function's secrets (dashboard: Edge Functions,
   Secrets). Paste all three:

   VAPID_PUBLIC_KEY=${vapidPublic}
   VAPID_PRIVATE_KEY=${d}
   REMINDER_TOKEN=${token}

3. Vault, for the scheduled job (dashboard: SQL Editor):

   select vault.create_secret('${projectUrl}/functions/v1/daily-reminder', 'daily_reminder_url');
   select vault.create_secret('${token}', 'daily_reminder_token');

Keep the private key and the token out of the repo and .env.local. If you
lose them, run this again and replace all of the above.`)
