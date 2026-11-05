# Plan: Opening the app to the public

Status: idea only, parked · 2026-11-05. Nothing here is scheduled. It records what opening up would take, so that if we ever do it we start from a checklist instead of from scratch.

## Goal

Anyone can sign in with Google and get their own synced account, with the same features you have: sync across devices, Ideas, Google Docs and daily reminders.

## Where things stand

The live site is already partly public. Anyone with the link can use it signed out, with data kept only in their own browser (the guest database). What strangers can't do is sign in, because the four locks in CLAUDE.md keep them out:

1. Google sign-in stays in Testing mode;
2. Supabase sign-ups are off;
3. every database rule requires the email to be in `allowed_emails`;
4. row-level security limits each user to their own rows.

Opening the app to the public means deliberately opening locks 1–3 and relying on lock 4. That's a policy change made on purpose, in its own PR, and not an exception to the rule "never weaken one to make another work".

## The locks

| Lock | Today | Public |
|---|---|---|
| 1. Google Testing mode | Only test users added by hand, 100 at most | Publish the OAuth app to Production. Sign-in uses only basic scopes (openid, email, profile), and the Docs button uses `drive.file`, which isn't a sensitive scope, so Google needs only brand verification (app name, logo, homepage, privacy policy and terms on a verified domain), not a security review. |
| 2. Supabase sign-ups | Off | On, with Google as the only provider. |
| 3. `allowed_emails` | Required by every rule | Removed in a migration, or replaced with an `approved` flag on a waitlist table if we want to let people in gradually. |
| 4. Row-level security | Each user sees only their own rows | **Unchanged.** It becomes the main protection, so it needs stronger tests first (see below). |

## Work before launch

### Security
- Extend `npm run test:db` with tests where user A tries to read, update, delete or `sync_push` user B's rows in every synced table, and into `push_subscriptions`. They must all fail with locks 1–3 already removed.
- Per-user caps enforced in SQL, so one account can't fill the database: a maximum number of projects, subtasks and ideas, and a maximum note length. The values are to be decided.
- Look at the `sync_push` and `claim_due_reminders()` functions again. `security definer` functions bypass row-level security, so each needs its own check.

### Accounts
- A **Delete my account** action in the ⋯ menu. It deletes the user's rows, their push subscriptions and their auth user (through an Edge Function, since only the service role can delete auth users), then signs out. Suggest exporting first.
- Exporting already covers taking your data with you.

### Legal
- A privacy policy and terms, hosted on the site. Google requires both.
- LGPD: the data is stored in São Paulo, and the operator is in Brazil. GDPR applies if anyone in Europe signs up. The privacy policy names what's stored (projects, ideas, email, push subscriptions), where, and how to delete it.

### Hosting and cost
- **Supabase Pro** (about $25 a month): a public project can't pause after a week of no activity, as free projects do, and Pro adds daily backups. Check the Realtime connection and Edge Function limits against the expected number of users.
- **A custom domain** for the site instead of `lhckb.github.io/content-tracker`. GitHub Pages can still host it.
- **Supabase custom auth domain** (a paid add-on), so the Google sign-in screen shows our domain instead of `xxxx.supabase.co`. Optional, but it makes sign-in more trustworthy.

### Operations
- Error tracking, for example Sentry. That's a new dependency, so it needs your approval.
- Uptime alerts for the site and Supabase.
- A contact address for support and data requests.
- Keep an eye on the every-minute reminder job and web-push sending as the number of devices grows.

### Product
- First-run onboarding (see `docs/plans/welcome-guide.md`).
- A translation, if the audience isn't English-speaking.
- An accessibility pass: keyboard drag alternatives, contrast, screen-reader labels.
- Clear steps for adding the app to the iPhone Home Screen, since reminders need it.

## Stages

1. **Guest mode (available now).** Share the link. Data stays on the device, and nothing needs to change.
2. **Invite-only beta.** Add people to `allowed_emails` and to Google's test users. No code changes, up to 100 people, and all four locks stay on. This shows what breaks with real users.
3. **Open sign-up.** Do the security, accounts and legal work above, move to Supabase Pro, publish the Google app, then remove lock 3 in a migration. Following CLAUDE.md, run it in production before merging the app change.

Most of the effort is in stage 3, and very little of it is code: it's the Google verification, the legal pages and account deletion.

## Open questions (for when this is picked up)

- A. Open sign-up for everyone, or a waitlist with approval?
- B. Values for the per-user caps.
- C. Free only, or a paid plan? Payments would be a separate plan.
- D. Which domain name?
- E. Languages: English only, Portuguese, or both?
