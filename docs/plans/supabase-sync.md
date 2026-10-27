# Plan: sign-in and sync with Supabase

Status: approved, in progress · 2026-10-27

## Goals

- **Sign in with Google.** Only allowlisted people can have an account; at first that's only `luis.carv.cruz@gmail.com`.
- **Data isolation.** Each user sees only their own projects, enforced by the database, not by the app.
- **Sync across devices.** The same projects on your Mac, your iPhone and any browser you sign in on.
- **Signed-out use still works**, on that device only. Signing in is the better path: it adds sync and a copy in the cloud, and the app says so.
- **Offline keeps working** when signed in. Changes made offline sync when the connection returns.
- **Free plan**, with data stored in **São Paulo** (`sa-east-1`).

**Not in this plan:**
- sharing or collaborators;
- moving today's projects over (we start fresh);
- opening the app with no connection at all (the postponed service-worker step);
- notifications.

## Decisions so far

| Topic | Decision |
| --- | --- |
| Service | Supabase (Postgres + Auth) |
| Sign-in | Google |
| Region | South America (São Paulo), `sa-east-1` |
| Plan | Free |
| Signed-out use | Allowed; sign-in encouraged |
| Existing projects | Start fresh, no migration |
| Signing out | Clears that device's copy of the account's data |
| Guest projects at sign-in | Offer to copy them into the account (question A) |
| Dependencies | `@supabase/supabase-js`, plus the `supabase` CLI as a dev dependency (question B) |
| Google sign-in app | Stays in Testing mode, you as the only test user (question C) |
| Other open devices | Live updates through Supabase Realtime (question D) |
| Automated tests | An email-and-password test user in the dev project only (question E) |

## How it works

```
 screens (unchanged)
      │  same src/data API as today
      ▼
 src/data ──► Dexie (on the device) ◄──► sync ◄──► Supabase: Postgres + Auth (São Paulo)
                                                        ▲
                                         Google sign-in ┘
```

- **The app still reads and writes only the local Dexie database**, so it stays instant and works offline. A sync module inside `src/data` sends local changes up and pulls changes from other devices. Screens don't change, apart from the new sign-in pieces.
- **Two local spaces:**
  - **Guest** (signed out): today's database, which never leaves the device.
  - **Account** (signed in): a separate local database per signed-in user, kept in sync with Supabase.

  Keeping them apart means signing out simply deletes the account database, and guest and account data can never mix by accident.

## Governance: who can get in, and what they can see

Four independent locks. Each one alone would stop a stranger reaching your data.

1. **Google's side.** The Google sign-in app stays in *Testing* mode, with you as its only test user. Google itself refuses anyone else.
2. **Supabase Auth.** "Allow new users to sign up" is **off**. Supabase refuses to create accounts; the only accounts are the ones added in the dashboard. Yours is added there, and your Google sign-in attaches to it by your confirmed email.
3. **Database allowlist.** Every data policy also requires the signed-in email to be in an `allowed_emails` table. An account that somehow existed still couldn't touch any data.
4. **Row-level security.**
   - Every row carries its owner's `user_id`, and every table allows read and write only where `user_id = auth.uid()`.
   - Row-level security is on for every table. Anyone who isn't signed in gets nothing.

**Also:**
- **Keys:** the app only ships the publishable (anon) key, which is safe because of locks 3–4. The service-role key is never used in the app and never committed. `.env.local` is gitignored.
- **Allowed return addresses:** Supabase only sends a signed-in user back to `https://lhckb.github.io/content-tracker/` and `http://localhost:5173/`.
- **Schema under review:** the tables, policies and functions live as SQL migrations in `supabase/migrations/`, reviewed in PRs like any code.
- **Audit and exit:** the Supabase dashboard shows users and sign-in logs. The data is plain Postgres, exportable at any time, and the app's JSON backup keeps working.
- **Adding someone later** is two steps: add the user in the dashboard and add a row to `allowed_emails`. Plus, while Google is in Testing mode, add them as a test user there.

## Data in Postgres

```sql
create table allowed_emails (email text primary key);

create table projects (
  id           uuid primary key,          -- the same id as on the device
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  title        text not null,
  platform     text not null check (platform in ('youtube', 'instagram')),
  color        text not null,
  publish_date date not null,
  notes        text not null default '',
  archived     boolean not null default false,
  deleted      boolean not null default false,   -- tombstone, so deletes sync
  edited_at    timestamptz not null,             -- when the device made the change
  updated_at   timestamptz not null default now() -- set by the server; pull cursor
);

create table subtasks (
  id         uuid primary key,
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  project_id uuid not null references projects on delete cascade,
  kind       text not null check (kind in ('task', 'publish')),
  title      text not null,
  start_date date not null,
  end_date   date,                           -- null = one day
  done       boolean not null default false,
  notes      text not null default '',
  sort_order double precision not null,
  deleted    boolean not null default false,
  edited_at  timestamptz not null,
  updated_at timestamptz not null default now()
);
```

- A trigger stamps `updated_at` on every write. There are indexes on `(user_id, updated_at)`.
- `end` and `order` are reserved words in SQL, so those columns become `end_date` and `sort_order`. `src/data` maps the names.

## Sync

- **Recording changes.** Every write in `src/data` also records "this record changed" in a local `pending` table, inside the same transaction. Deletes are recorded too.
- **Push.** When signed in and online: shortly after each change, and when the app opens, regains focus or comes back online. Pending records go to a Postgres function, `sync_push`, in one call.
  - It applies all of them in one transaction, so a project and its Publish subtask always arrive together.
  - Each record is applied only if its `edited_at` is newer than what's stored, so a device that was offline for days can't overwrite newer edits from another.
  - Once acknowledged, the pending entries are cleared.
- **Pull.** On open, focus, reconnecting and after each push, the app fetches rows whose `updated_at` is later than the last pull, and applies them locally. Tombstones delete the record on the device. The window overlaps slightly and applying is idempotent, so late-arriving writes aren't missed.
- **Live updates (proposed).** Supabase Realtime pushes changes to other open devices within seconds. Without it, other devices update on open, focus or every few minutes. See question D.
- **Repairs after each pull.**
  - A project's Publish subtask always matches its publish date; the project wins.
  - No two active projects share a color when a free one exists.
- **Conflicts.** The newest edit of each record wins. For one person on a few devices, a real conflict needs the same record edited on two offline devices; the plan accepts that. Per-field merging can come later if it ever matters.
- **Status.** `useSyncStatus()`: signed out · syncing · synced (with time) · offline, will sync · can't reach the server.

## Sign-in experience

- **Signed out:**
  - The app works as today.
  - The top bar shows **Sign in to sync**.
  - The ⋯ menu note reads: "Saved on this device only. Sign in with Google to keep your projects safe and on all your devices."
  - A dismissible tip appears on the empty first-run screen.
- **Signing in:** **Continue with Google** → Google → back to the app, signed in, with your account's projects loading.
- **Signed in:**
  - An account button in the top bar shows your initial and the sync status.
  - Its menu shows your email, "Synced · 2 min ago" (or offline / can't sync, with Retry), and **Sign out**.
- **Not allowed:** if Google signs you in but Supabase refuses the account, the app says "This Google account isn't allowed to use Content Tracker."
- **Signing out:**
  - A confirmation: "This device's copy of your projects will be removed. They stay in your account."
  - If changes haven't synced yet, the app says so and offers to sync first.
  - The account database is then deleted and the app returns to guest.
- **Backup import while signed in** replaces everything **in your account** on every device. The warning says exactly that.

### Google sign-in method

- **First choice:** Supabase's redirect flow, `signInWithOAuth({ provider: 'google', options: { redirectTo } })`. supabase-js completes it when the app reloads.
- **iPhone Home Screen app:** sign-in redirects leave the app, and it isn't certain they come back *into it* with the session. The test step checks this.
- **Fallback:** Google's own sign-in button with `signInWithIdToken`, which needs no redirect.

## Free plan notes

- **Pausing.** Free projects pause after 7 days of low activity, and you can restore them from the dashboard within 90 days.
  - Because the app works from the device's copy, a pause only stops syncing. The app shows "Can't reach the sync server".
  - Upgrading later (Pro, $25/month) removes pausing.
- **Limits.** A 500 MB database is far more than this app needs. The free plan allows **two projects**: `content-tracker` (production) and `content-tracker-dev` (development and tests, so tests never touch your data).

## Steps

One branch and one PR, with a commit per step. You merge.

Order: step 0 needs the accounts only you can create (see below), so steps 1–3 are built first, against a local Postgres and a fake server. Step 0 runs as soon as the dev project exists. Its findings can change only the Google sign-in method, not steps 1–3.

0. **Test step (go/no-go).** Against the dev project, with throwaway code:
   - Google sign-in works with sign-ups off, for an account added in advance.
   - A different Google account is refused.
   - With only the publishable key, nothing can be read or written.
   - One user can't see another user's rows (two dev test users).
   - Google sign-in from the iPhone Home Screen app comes back signed in; otherwise switch to the fallback method.
   - The project really is in São Paulo.
1. **Database.** The migration with tables, triggers, row-level security, the allowlist and `sync_push`. Applied to dev, with scripted policy checks.
2. **Local spaces and change recording.** Dexie schema v2, the guest and account databases, and change recording in every write. Unit tests.
3. **Sync engine.** Push, pull, repairs and status. Unit tests against an in-memory fake server: conflicts, tombstones, retries, the overlapping window. Plus a round trip against the dev project.
4. **Sign-in UI.** The account button and menu, sign-in prompts, sync status, sign-out clearing, error messages, and the guest-copy offer if you approve it (question A). Desktop and phone.
5. **Production.** Set up the production project (migration, Google provider, sign-ups off, your account, allowlist row). Build settings go in GitHub Actions. Update CLAUDE.md: remove "accounts or cloud sync" from out of scope, and document the sync and governance rules. Then verify on desktop and iPhone.

## Things only you can do

I'll give exact steps at the time.

1. **Supabase:** create an account. Create two projects in São Paulo on the Free plan: `content-tracker` and `content-tracker-dev`.
2. **Google Cloud:**
   - Create a project.
   - Set up the OAuth consent screen (External, **Testing**, you as test user).
   - Create a Web OAuth client:
     - origins: `https://lhckb.github.io` and `http://localhost:5173`;
     - redirect: `https://<project-ref>.supabase.co/auth/v1/callback`.
3. **Supabase dashboard:**
   - Turn on Google with the client ID and secret.
   - Turn **off** "Allow new users to sign up".
   - Set the Site URL and Redirect URLs.
   - Add your user.
4. **Send me** each project's URL and publishable key. These are public by design; nothing secret is needed by me or the app.

## Testing

- **Unit:** sync rules against a fake server, and the existing 78 tests kept green.
- **Database:** scripted checks that strangers, the publishable key alone, and a second user all get nothing.
- **Browser:**
  - Two headless browsers signed in as a dev test user: a change on one appears on the other.
  - Offline: switch one browser offline, edit, reconnect, and the change syncs.
  - Signing out clears the device.
- **On your devices:** sign in on the Mac and the iPhone (Safari and the Home Screen app). Edit on one, see it on the other.

## Risks

| Risk | Mitigation |
| --- | --- |
| Google redirect doesn't return into the iPhone Home Screen app | Checked in step 0; fall back to Google's sign-in button |
| Free project pauses after a quiet week | The app keeps working locally; restore in the dashboard, or upgrade |
| An old offline device overwrites newer edits | Newer-edit-wins check in `sync_push` |
| The same record edited on two offline devices | The newest edit wins; per-field merge later if needed |
| Device clocks disagree | Only affects which conflicting edit wins; pulls use server time |
| Secret key leaks | The app never uses it; it's never in the repo; `.env.local` is gitignored |
| Supabase is down | Local-first: the app keeps working, and sync resumes later |

## Open questions

A. **Signed-out projects at sign-in.** If a device has guest projects when you sign in, should the app offer to copy them into your account? This is my recommendation: it makes signing in the obvious next step. Or should guest and account stay fully separate? A: yes the app should offer to copy

B. **Dependencies.** May I add `@supabase/supabase-js` (the app) and `supabase` (the command-line tool, dev only, for migrations)? Nothing else. A: yes

C. **Google Testing mode.** Is it fine to keep the Google sign-in app in Testing mode, with you as the only test user (lock 1)? A: yes

D. **Live updates.** Should changes appear on your other open devices within seconds (Supabase Realtime, included free)? Or only when you open or focus the app, and every few minutes? I recommend live updates. A: if it's free do it live

E. **Automated tests.** Is it OK to have an email-and-password test user in the **dev** project only, so automated tests can sign in? Production stays Google-only. A: yes
