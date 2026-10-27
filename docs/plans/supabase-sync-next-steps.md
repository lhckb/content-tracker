# Sign-in and sync: next steps

Status on 2026-10-27, after the production project was set up. The plan is in [supabase-sync.md](supabase-sync.md), and the checks so far are in [../testing/manual-tests.md](../testing/manual-tests.md).

## Where things stand

- **The work** is on branch `supabase-sync`, in one PR to `main` with a commit per step.
- **The dev Supabase project** `content-tracker-dev` (`ldfzwpxcckxqywmdqnnx`, São Paulo) is set up and verified (T-01 to T-10):
  - sign-ups off;
  - your Gmail and `test@content-tracker.dev` added and allowlisted;
  - Google sign-in working on the Mac and the iPhone;
  - sync working live;
  - each account sees only its own data.
- **The production Supabase project** `content-tracker` (`uwfyzskkiowvaugqcgrq`, São Paulo) was checked from outside in T-11:
  - the migration ran and refuses anyone signed out;
  - Google is the only provider;
  - Google accepts its callback;
  - **sign-ups are still on** (see step 1).
- **Repository variables** `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` hold the production values. Only the deploy on `main` reads them, so the live site stays signed-out only until the merge.
- `.env.local` (gitignored) still points the dev server at the dev project.

## 1. You: turn off sign-ups in production

In the production project: **Authentication → Sign In / Providers → "Allow new users to sign up" off**, then Save. Tell Claude, who re-checks it the T-07 way and logs it. **Don't merge before that.**

## 2. Optional: run the database tests locally

`brew install postgresql@17`, then tell Claude to run `npm run test:db`. This is T-02 in the test log. It's the only check that covers an account that exists but isn't on the allowlist.

## 3. You: merge the PR

Once the "Tests, lint and build" check passes and sign-ups are confirmed off. The merge deploys the live site with sign-in.

## 4. After the merge: on the live site (log as T-12 onwards)

- **On the Mac,** in the browser that holds your real projects, open https://lhckb.github.io/content-tracker/ and sign in with Google. When asked to add that browser's signed-out projects to your account, choose **Add to account**. On other browsers, choose Not now.
- **On the iPhone:**
  1. Delete the Home Screen icon from the Wi-Fi test.
  2. Open the live site in Safari: ⋯ → Share → **Add to Home Screen**, with Open as Web App on.
  3. Open it from the Home Screen and **sign in from inside it**. This is the last open question: whether Google's sign-in comes back into the Home Screen app. If it doesn't, the fallback (Google's own sign-in button with `signInWithIdToken`) is described in the plan.
- **Check both devices together:** a change on one appears on the other within a few seconds, and signing out clears the device.
- **Also try a different Google account.** Google should block it, because the sign-in app is in Testing mode.

Your first sign-in also confirms what T-11 couldn't see from outside: your user exists, your email is on the allowlist, the Redirect URLs are right, and live updates work.

## Still open from the test log

- **T-02:** the local database tests haven't run (see step 2).
- **T-09:** confirm whether your iPhone sign-in was done inside the Home Screen app, or only in Safari. Step 4 repeats it on the live site anyway.

## Handy facts

- **Phone testing against dev:** `npm run dev:phone`, then open http://luiss-macbook-air.local:5173 on the iPhone (same Wi-Fi). That address is already in the dev project's Redirect URLs.
- **Automated tests against dev** sign in as `test@content-tracker.dev`, whose password is in `.env.local`.
- **To resume,** tell Claude: "continue with docs/plans/supabase-sync-next-steps.md".
