# Sign-in and sync: next steps

Status on 2026-10-27, at the break. The plan is in [supabase-sync.md](supabase-sync.md), and the checks so far are in [../testing/manual-tests.md](../testing/manual-tests.md).

## Where things stand

- **The work** is on branch `supabase-sync`, **local only** (not pushed yet, no PR yet). It holds 9 commits:
  - the plan;
  - the database migration;
  - local spaces and change recording;
  - the sync engine;
  - the sign-in UI;
  - production build settings;
  - the phone dev-server fix;
  - the manual test log;
  - this file.
- **The dev Supabase project** `content-tracker-dev` (`ldfzwpxcckxqywmdqnnx`, São Paulo) is set up and verified:
  - sign-ups off;
  - your Gmail and `test@content-tracker.dev` added and allowlisted;
  - Google sign-in working on the Mac and the iPhone;
  - sync working live;
  - each account sees only its own data (T-01 to T-10).
- `.env.local` (gitignored) points the dev server at the dev project.
- The live site is unchanged and still runs signed-out only, because no build settings have been set yet.

## 1. You: create the production project

**In Supabase:**
1. **New project:**
   - name `content-tracker`, same organization, region **South America (São Paulo)**, Postgres (default);
   - generate a database password and save it in your password manager;
   - **Security:** Data API **on**, "Automatically expose new tables" **off**, "Enable automatic RLS" **on**.
2. **SQL Editor:**
   - Run the whole of `supabase/migrations/20261027120000_init.sql`.
   - Then run `insert into public.allowed_emails values ('luis.carv.cruz@gmail.com');`. Production has no test user.
3. **Authentication → Users → Add user:** `luis.carv.cruz@gmail.com`, **Auto Confirm** ticked, a long random password you'll never use.
4. **Authentication → Sign In / Providers:**
   - **Google** on, with the same client ID and secret as dev.
   - **"Allow new users to sign up" off.**
   - **Email** off. Production is Google-only. Turn it off *after* adding your user, in case Supabase needs it on to create one.
5. **Authentication → URL Configuration:**
   - Site URL `https://lhckb.github.io/content-tracker/`
   - Redirect URLs `https://lhckb.github.io/content-tracker/**`

**In Google Cloud,** in the same OAuth client (Google Auth Platform → Clients), keeping it in Testing mode with only you as test user:
- add the authorized JavaScript origin `https://lhckb.github.io`;
- add the authorized redirect URI `https://<prod-project-ref>.supabase.co/auth/v1/callback`.

**Then send Claude** the production **Project URL** and **publishable key**, from Project Settings → API. Never send the service-role key.

## 2. Optional: run the database tests locally

`brew install postgresql@17`, then tell Claude to run `npm run test:db`. This is T-02 in the test log. It's the only check that covers an account that exists but isn't on the allowlist.

## 3. Claude: open the PR

1. Check sign-ups are off on production, the same way as T-07.
2. Set the repository variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` to the production values: `gh variable set`, or GitHub → Settings → Secrets and variables → Actions → Variables. The deploy workflow already reads them.
3. Mark the plan done, push `supabase-sync`, and open **one PR** with a commit per step. Wait for the "Tests, lint and build" check.
4. You merge.

## 4. After the merge: on the live site (log as T-11 onwards)

- **On the Mac,** in the browser that holds your real projects, open https://lhckb.github.io/content-tracker/ and sign in with Google. When asked to add that browser's signed-out projects to your account, choose **Add to account**. On other browsers, choose Not now.
- **On the iPhone:**
  1. Delete the Home Screen icon from the Wi-Fi test.
  2. Open the live site in Safari: ⋯ → Share → **Add to Home Screen**, with Open as Web App on.
  3. Open it from the Home Screen and **sign in from inside it**. This is the last open question: whether Google's sign-in comes back into the Home Screen app. If it doesn't, the fallback (Google's own sign-in button with `signInWithIdToken`) is described in the plan.
- **Check both devices together:** a change on one appears on the other within a few seconds, and signing out clears the device.
- **Also try a different Google account.** Google should block it, because the sign-in app is in Testing mode.

## Still open from the test log

- **T-02:** the local database tests haven't run (see step 2).
- **T-09:** confirm whether your iPhone sign-in was done inside the Home Screen app, or only in Safari. Step 4 repeats it on the live site anyway.

## Handy facts

- **Phone testing against dev:** `npm run dev:phone`, then open http://luiss-macbook-air.local:5173 on the iPhone (same Wi-Fi). That address is already in the dev project's Redirect URLs.
- **Automated tests against dev** sign in as `test@content-tracker.dev`, whose password is in `.env.local`.
- **To resume,** tell Claude: "continue with docs/plans/supabase-sync-next-steps.md".
