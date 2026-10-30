# Plan: Notifications

Status: built and in review · 2026-10-30. You answered A–D and chose the recommendation for N.

You handle the Supabase side, following "Setting up a Supabase project" below:
1. You set up dev.
2. I run the dev checks.
3. You set up production, before merging.

The checks so far are T-02 and T-25 to T-28 in `docs/testing/manual-tests.md`.

## Goal

Once a day, at a time you pick, your phone shows one notification:

> You have 3 tasks for 2 projects today, plus 1 overdue

It arrives even when the app is closed, and tapping it opens the app.

**The sentence follows the counts:**
- "You have 1 task for 1 project today", when nothing is overdue;
- "…, plus 2 overdue", when tasks are overdue (decision D);
- "You have 2 overdue tasks", when there's nothing for today but some tasks are overdue (decision N);
- nothing at all, on a day with no tasks and nothing overdue (decision C).

The sentence is the notification's title, with no body under it. iOS shows "Content Tracker" above it. The Mac can get it too, because each device is turned on separately.

## What it needs

- **You're signed in.** The reminder is sent from Supabase, which only sees what's synced to your account. A guest's projects never leave the device, so a signed-out device can't get reminders.
- **On the iPhone, the Home Screen app,** on iOS 16.4 or later. A Safari tab can't receive notifications. On the Mac, Safari, Chrome and Firefox work in a normal tab.
- **You turn it on with a tap.** iOS only shows its permission prompt in response to one.

## Screens

### Turning it on

A **Notifications…** item in the ⋯ menu opens a small card. On the phone, it's a full-screen sheet like the other cards.

- **A "Daily reminder on this device" switch.** The first time you turn it on, the device asks for permission.
- **Time:** any time of day, to the minute, using the device's own time picker (decision A). It's set to 8:00 AM at first.
- **A line saying what it does:** "Every day at 8:00 AM: 'You have 3 tasks for 2 projects today, plus 1 overdue.' Nothing on days with nothing to do."
- **When it can't be turned on,** the switch is disabled and a line says why:
  - signed out: "Sign in to get notifications. They count the tasks in your account."
  - an iPhone Safari tab: "On iPhone, notifications work in the Home Screen app. In Safari, tap Share, then Add to Home Screen."
  - permission refused: "Notifications are blocked for Content Tracker. Allow them in your device's settings, then come back here."
  - a browser without push: "This browser can't show notifications."
- **Builds without Supabase, or without the push key,** don't show the menu item.

### The notification

- Tapping it opens the app, or brings an open window to the front.
- A new reminder replaces yesterday's if that one is still in Notification Center.

### Signing out

Signing out turns notifications off on that device, because they belong to the account. After signing back in, you turn them on again.

## How it works

1. **Turning it on** saves the device's push address to your account. The address is a link at Apple's, Google's or Mozilla's push service, plus two keys that encrypt messages to it. The device's time zone and your chosen time are saved with it.
2. **Every minute,** a scheduled job in the database (Supabase Cron) checks whether any device has reached its time. Only when one has does it call a small server function, `daily-reminder` (a Supabase Edge Function). So the function runs about once per reminder, not 1,440 times a day.
3. **The function asks the database** which devices are due. In the same step, the database marks those as sent and counts each one's tasks for that device's today.
4. **The function sends each device its sentence,** encrypted and signed, through that device's push service. If the service says the address no longer exists, the function removes it. That happens when the app was deleted, or notifications were turned off in Settings.
5. **The device's service worker,** a small script the browser keeps for the app (`public/sw.js`), shows the notification, even when the app is closed.

### What counts

Each device counts against its own today, in its own time zone. Archived projects are left out, and so are deleted ones (decision B).

- **Tasks for today:** every subtask that isn't ticked and whose day or range covers today. That's regular tasks, Publish and clean-up tasks: the chips the calendar shows on today.
- **Projects:** the number of projects those tasks belong to.
- **Overdue:** every subtask that isn't ticked and whose last day is before today. These are the chips the calendar outlines in red, clean-up tasks included.

## Data

### On the device

- **No Dexie changes.** Notification settings belong to the device and the server, not to the synced data. So there's no new local table and no Dexie version bump, and none of it goes in backups.
- **`src/data/notifications.ts`** is the only code that talks to push and to the new table:
  - `notificationStatus()` returns one of: unavailable, sign in first, needs the Home Screen app, blocked, off, or on (with the time).
  - `turnOnNotifications(time)` asks for permission first, straight from the tap, then subscribes and saves the row.
  - `setReminderTime(time)` changes the time.
  - `turnOffNotifications()` deletes the row, then unsubscribes.
  - `refreshNotifications()` runs at startup. It updates the device's time zone if it changed, so travel doesn't shift the reminder. It never re-creates a row the server removed.
  - `signOut()` calls `turnOffNotifications()` first.
- **`public/sw.js`** is hand-written. It handles only `push` (show the notification) and `notificationclick`. It has no fetch handler and caches nothing, so loading and updating the app work as they do now. It's registered at startup with a relative path, so it works under `/content-tracker/`.
- **A build variable, `VITE_VAPID_PUBLIC_KEY`,** holds the public half of the key that signs the pushes. Like the Supabase URL, it's public by design. It goes in `.env.local` for dev, and in a GitHub Actions variable for the live site.

### On the server

A new migration, `supabase/migrations/<timestamp>_notifications.sql`.

**The `push_subscriptions` table** has one row per device:

- **Columns:**
  - `endpoint` (the primary key), `p256dh` and `auth`: the push address and its two keys;
  - `user_id`;
  - `time_zone`;
  - `remind_at`, a time of day in whole minutes;
  - `last_sent_on`, a date;
  - `created_at` and `updated_at`.
- **Row rules:** the same as the other tables: only your own rows, `is_allowed()`, and nothing for anyone signed out. Unlike the synced tables, the app deletes rows outright, so signed-in users are allowed to delete.
- **Time zone check:** a trigger refuses a time zone Postgres doesn't know. Otherwise one bad row could stop the job for everyone.
- **Not synced:** it isn't in Realtime or `sync_push`.

**Functions for the server side only:**

- **`claim_due_reminders()`** picks the devices that meet all of these:
  - their local time has reached `remind_at`, by less than an hour and on the same date. So a 11:30 PM reminder never goes out after midnight;
  - they haven't had a reminder for that local date;
  - their account's email is still in `allowed_emails`.

  In the same statement, it marks them as sent for that date. So two runs at the same time can't send twice, and a late run still sends. It returns the push address, the keys and the three counts, for the devices with a task today or one overdue.
- **`reminders_due()`** is the job's cheap check: it's true when some device's time has come.
- **`forget_push_subscriptions(endpoints)`** removes addresses the push service says no longer exist.
- All three are `security definer`, and app users and anonymous callers can't run them. The server function runs the claim and the forget with the secret key (the `service_role`). The scheduled job runs `reminders_due()` as the database owner.

**The schedule:**

- The migration turns on `pg_cron` and `pg_net`, then schedules the every-minute job.
- The local Postgres used by `npm run test:db` doesn't have those extensions, so there the migration skips this part.
- The job reads the function's address and a reminder token from Supabase Vault, as `daily_reminder_url` and `daily_reminder_token`. So the migration holds no secrets and is the same for dev and production.

**Compatible with the live app:** nothing the live app uses changes.

**Tests (`npm run test:db`):**

- the row rules;
- tasks for today:
  - a one-day task and a range covering today;
  - done tasks, archived projects, deleted projects and other users' tasks are left out;
- overdue:
  - a task that ended yesterday, and a range that ended yesterday;
  - done tasks and archived projects are left out;
- the time window:
  - at most once a day;
  - a late run within the hour still sends;
  - a late-evening time doesn't send after midnight;
- a day with nothing is marked as sent but not returned, and a day with only overdue tasks is returned;
- an unknown time zone is refused;
- app users and anonymous callers can't run the functions;
- an account whose email was removed gets nothing.

### The server function

`supabase/functions/daily-reminder/index.ts` runs on Deno, in Supabase Edge Functions.

- **It refuses any call without the reminder token,** which comes in a header. The new Supabase keys aren't JWTs, so Supabase's own check (`verify_jwt`) has to be off for a scheduled call, and the function checks the token itself. Someone holding the token could only start a run, and a run only sends reminders that are due, at most once a day.
- **It reads the database with the secret key Supabase gives every function** (`SUPABASE_SECRET_KEYS`), only through the functions above.
- **It sends with `web-push` 3.6.7,** which handles the encryption and signing (VAPID). The function's `deno.json` pins it and supabase-js 2.118.0, and `deno.lock` records exactly what was fetched. Its type definitions (`@types/web-push`) are used for type checks only. Each push expires after 6 hours, so a reminder the phone couldn't receive in the morning doesn't arrive at night.
- **It reads three secrets:** `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY` and `REMINDER_TOKEN`.
- **Push services ask for a contact address** (the VAPID subject). The function gives the live site's address, so no email address is sent to Apple or Google.
- **The sentence** comes from `reminderText({ tasks, projects, overdue })`, in a plain `message.ts` next to the function. Vitest tests it along with the other tests.
- **Type checks:** `tsc -b` only covers `src/`, so the function is checked with `deno check --config supabase/functions/daily-reminder/deno.json supabase/functions/daily-reminder/index.ts`. Deno is already installed on the Mac.

### Keys

| Key | Where it lives | Public? |
| --- | --- | --- |
| VAPID public key | build variable and function secret | yes |
| VAPID private key | function secret, in each project | no |
| Reminder token | function secret and Vault, in each project | no |
| Secret key (`service_role`) | only Supabase's own environment for functions | no |

A script, `scripts/notification-keys.mjs`, prints a fresh VAPID key pair and a token, and where each goes. It uses Node's own crypto, with no dependency. You run it once per project, so the private values pass only through your terminal and the Supabase dashboard.

## Setting up a Supabase project

Do this in dev first, then in production before merging. Each project gets its own keys and token.

1. **Run the migration,** `supabase/migrations/20261030120000_notifications.sql`, in the SQL Editor.
   - It also turns on pg_cron and pg_net and schedules the `daily-reminder` job.
   - Integrations, Cron should then list `daily-reminder`, running every minute.
2. **Make the keys:** run `node scripts/notification-keys.mjs https://<project-ref>.supabase.co`. It prints:
   - `VITE_VAPID_PUBLIC_KEY`, for the app;
   - three function secrets;
   - two Vault lines.
3. **Set the function secrets:** in Edge Functions, Secrets, paste `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `REMINDER_TOKEN`.
4. **Set the Vault secrets:** run the two `vault.create_secret` lines in the SQL Editor.
5. **Deploy the function** from `supabase/functions/daily-reminder` with its JWT check **off**, so the job's calls aren't refused before the function can check the token. Either way:
   - with the CLI, from the repo root (not from inside `supabase/`, where it can't find the function): `supabase functions deploy daily-reminder --project-ref <project-ref> --no-verify-jwt`. The warning that Docker isn't running is fine; the CLI then bundles on Supabase's side;
   - in the dashboard: Edge Functions, Deploy a new function, Via editor. Name it `daily-reminder`, add `index.ts`, `reminders.ts` and `deno.json`, then turn off its JWT verification in the function's settings.
6. **The app:**
   - Dev: add `VITE_VAPID_PUBLIC_KEY` to `.env.local` and restart `npm run dev`.
   - Production: add a repository variable `VITE_VAPID_PUBLIC_KEY` (Settings, Secrets and variables, Actions, Variables).
7. **Check it** in the SQL Editor:
   - `select public.reminders_due();` returns `false` while no device is due.
   - `select status, return_message from cron.job_run_details order by start_time desc limit 3;` shows the job succeeding every minute.

**Replacing a value later:**
- A Vault secret: `select vault.update_secret((select id from vault.secrets where name = 'daily_reminder_token'), '<new token>');`. The token must match the `REMINDER_TOKEN` function secret.
- New VAPID keys end every device's subscription, because push services tie each subscription to the public key. Turn reminders off and on again on each device.

## The four locks

- **Google Testing mode and sign-ups off:** unchanged.
- **The allowlist:** the new table's rule requires `is_allowed()`. The claim also skips any account whose email is no longer in `allowed_emails`, so removing someone stops their reminders too.
- **Your own rows only:** the new table follows the same rule. The server function reads across accounts, but only through `claim_due_reminders()`. That returns counts and push addresses, never titles or notes. The pushes carry only the sentence, encrypted for the device.

## What doesn't change

The calendar, projects, ideas, local-first data and sync, backups, guest use, and the four locks.

CLAUDE.md does change:

- Notifications leave "Out of scope for the MVP" and get their own "added after the MVP" section, like sign-in. That section notes that `push_subscriptions` is the one table that isn't in Dexie and isn't written with `writing()`.
- The Keys rule notes that the secret key is used only by the server function, inside Supabase's own environment.

## Steps

One branch (`notifications`, cut from `main`), one PR, and one commit per step. You merge.

This doesn't depend on the welcome guide. Both add an item to the ⋯ menu, so whichever merges second takes a small merge. Manual tests take the next free T-numbers after the welcome guide's.

**You handle the Supabase side.** For each project, dev first, that means:
- running the migration;
- adding the function's address and the reminder token to Vault;
- setting the function's three secrets;
- deploying the function with its JWT check off.

The exact steps are under "Setting up a Supabase project" below.

1. **Database:**
   - first, the fix to the existing test that T-02 found, and `run-local.sh` finding Homebrew's Postgres 17 without `PG_BIN`;
   - the migration and its access tests, run here with `npm run test:db`;
   - you run the migration in dev.
2. **Server function:**
   - the function, the sentence and its test, and the key script;
   - you set it up in dev;
   - I check from outside that it refuses calls without the token.
3. **The app:**
   - the service worker, `src/data/notifications.ts` and the Notifications card;
   - turning off on sign-out, the startup refresh, and `VITE_VAPID_PUBLIC_KEY`;
   - checked in the browser at desktop and phone widths, every state of the card;
   - then end to end on the Mac at localhost, against dev. You turn it on in Safari or Chrome with a time two minutes ahead, and the reminder arrives then. This also proves the scheduled job and the token.
4. **Wrap-up:**
   - CLAUDE.md, `.env.example`, and the new variable in `deploy.yml`;
   - production, before merging: you set it up as in dev, and add the GitHub variable;
   - I check production from outside;
   - you merge;
   - then you reload the iPhone's Home Screen app, turn notifications on and tell me whether one arrives, and I log it.

Every browser and API check is logged in `docs/testing/manual-tests.md`.

## Dependencies and tools

- **`web-push` 3.6.7 (npm)** is approved. Only the server function imports it, so the app's `package.json` doesn't change.
  - Checked under Deno 2.9 on the Mac, the runtime Supabase's functions use: it builds a push whose VAPID signature verifies and whose body decrypts back to the sentence.
  - Step 2 confirms it on Supabase itself.
- **Postgres 17 (Homebrew),** installed, so that `npm run test:db` runs here. Homebrew's post-install step didn't run the first time, which left Postgres unable to find its own files. Running `brew postinstall postgresql@17` fixed it.
- **No new app dependency.** The service worker is hand-written, rather than coming from a PWA plugin.

## Risks

- **The iPhone can only be tested after the merge.** Service workers need HTTPS or localhost, and `npm run dev:phone` is plain HTTP. So step 3 tests on the Mac, and the iPhone check happens on the live site.
- **The count comes from the server.** A change made offline that hasn't synced by reminder time isn't counted.
- **Delivery isn't guaranteed.** A Focus mode, Low Power Mode or a phone that's off can delay or hide it, and after 6 hours it's dropped.
- **Deleting and re-adding the Home Screen app** gives it a new push address, so you turn notifications on again there.
- **The check happens once a day, at your time.** If there's nothing then, a task added for today later doesn't bring a reminder.
- **The token sits in a `pg_net` queue table** while a request waits. Anyone who can log in to the database can read it there, as Supabase's own docs warn. That's why the job uses its own narrow token, not the secret key.

## Decisions

**A. What time?**
- You pick the hour on each device, from 5 AM to 10 PM.
- Always 8 AM.
- One time for the whole account.

A: any time of day, to the minute, on each device. 8:00 AM to start.

**B. Which tasks count?**
- Every unticked subtask on today, in active and wrapping-up projects.
- Leave out clean-up tasks.

A: leave out only archived projects. Every kind of subtask counts.

**C. What about a day with nothing to do?**
- No notification.
- "You have no tasks today."

A: no notification.

**D. Overdue tasks?**
- Neither counted nor mentioned.
- Counted in the total.
- An extra part when there are some: "You have 3 tasks for 2 projects today, plus 1 overdue."

A: the extra part at the end.

**N. Nothing today, but some tasks overdue?**
- *(Recommended)* "You have 2 overdue tasks." Overdue tasks are still something to do.
- No notification, as on an empty day.
- "You have 0 tasks for 0 projects today, plus 2 overdue."

A: "You have 2 overdue tasks."

**Defaults I chose (change any before work starts):**

- **E.** Each device is turned on, timed and turned off on its own.
- **F.** The setting lives under Notifications… in the ⋯ menu. When the switch is disabled, the card says why.
- **G.** The sentence is the notification's title, with no body. Tapping it opens the app.
- **H.** Signing out turns notifications off on that device.
- **I.** The time zone is the device's own, updated each time the app opens.
- **J.** At most one reminder per device per day. A late run still sends within the hour after your time, but never after midnight; after that, the day is skipped.
- **K.** A push expires after 6 hours.
- **L.** The contact address for push services is the live site's address, not an email address.
- **M.** Dev and production each get their own keys and token.
- **O.** Changing the time starts the day afresh: if today's reminder has already gone out, it comes again at the new time.
- **P.** Turning on always makes a fresh push subscription, because an old one may be an address the push service has dropped.
