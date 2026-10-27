# Manual test log

Every check that isn't part of `npm test`, whether done by hand or with a throwaway browser or API script. Newest first. Each entry says what was checked, where, how (so it can be repeated), and the result.

**Where:**
- the local dev server, on http://localhost:5179 for automated runs and http://localhost:5173 for yours;
- the dev Supabase project `content-tracker-dev` (`ldfzwpxcckxqywmdqnnx`, São Paulo);
- the production Supabase project `content-tracker` (`uwfyzskkiowvaugqcgrq`, São Paulo), checked from outside only, since it has no test user;
- the live site, https://lhckb.github.io/content-tracker/.

**Tools:**
- Playwright driving headless Chromium or WebKit, emulating an iPhone 15 for phone checks;
- Node scripts using `@supabase/supabase-js` with the **publishable key only**, signed in as the dev test user `test@content-tracker.dev`;
- `curl`.

The scripts were throwaway and not committed; their steps are written out below.

**Results:** ✅ pass · ❌ fail (with what was done about it) · ⏳ not run yet.

---

## Branch `supabase-sync`: sign-in and sync (2026-10-27)

### T-11 · Production project setup, through the public API · ✅ except sign-ups
- **Where:** the production project, with the publishable key only and signed out. Production has no test user, so nothing here signs in.
- **How:** a Node script.
  1. Read `/auth/v1/settings`. The sign-up probe from T-07 only runs if sign-ups report as off, so nothing is ever created.
  2. Signed out, read `projects`, `subtasks` and `allowed_emails`, and call `sync_push` with empty lists. `42501` means the migration ran and its permissions hold. "Not found" (`PGRST205` or `PGRST202`) would mean it didn't run.
  3. Start a Google sign-in at `/auth/v1/authorize` and read the redirect without following it.
  4. Open the Google page it points to, without choosing an account. As a control, open the same page with a made-up callback address.
- **Result:**

  | Check | Result |
  | --- | --- |
  | Sign-in providers on | ✅ google only (Email is off) |
  | Sign-ups disabled | ❌ `false`: sign-ups are still on. The sign-up probe was skipped. Waiting for you to turn them off; re-check below. |
  | Signed out: read `projects`, `subtasks`, `allowed_emails` | ✅ all refused (`42501` permission denied) |
  | Signed out: call `sync_push` | ✅ refused (`42501`) |
  | Google sign-in start | ✅ 302 to Google, same client ID as dev, callback `https://uwfyzskkiowvaugqcgrq.supabase.co/auth/v1/callback` |
  | Google accepts that callback | ✅ Google's normal sign-in page. The made-up callback got `redirect_uri_mismatch`, which shows the check would catch a missing one. |

- **Can't be checked from outside:**
  - that your email is on the allowlist;
  - that your user exists;
  - the Redirect URLs list (Supabase no longer puts the return address in a readable form);
  - live updates.

  Your first sign-in on the live site covers all four (T-12 onwards).
- **Also done:** set the repository variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` to the production values (`gh variable set`). Only the deploy on `main` reads them.

### T-10 · Data isolation between two real accounts · ✅
- **Where:** dev Supabase project. By then it held data from both the test user and your Gmail account (from T-09).
- **How:**
  1. A Node script signed in as the test user and read every row it could see in `projects` and `subtasks`.
  2. It counted any rows whose `user_id` wasn't its own.
  3. It also explicitly queried `projects` where `user_id ≠ me`.
- **Result:**
  - It could read 4 projects and 13 subtasks, **0 of them someone else's**.
  - The explicit query for other users' projects returned 0.

### T-09 · Google sign-in with your Gmail, on the Mac and the iPhone (done by you) · ✅ (as reported)
- **Where:** the dev server, on http://localhost:5173 (Mac) and http://luiss-macbook-air.local:5173 (iPhone on the same Wi-Fi, `npm run dev:phone`). Dev project with sign-ups off.
- **How:** Sign in → Continue with Google → `luis.carv.cruz@gmail.com`. On the iPhone, Safari's ⋯ → Share → Add to Home Screen, with Open as Web App on.
- **Result:** you reported that sign-in works and that sync works on your Gmail account.
- **To confirm:** whether sign-in was also done from inside the Home Screen app. Either way, that check is repeated on the live site after the merge (T-11).

### T-08 · Dev server reachable by the Mac's network name; sign-in return address · ✅ (after a fix)
- **Where:** the dev server run with `--host`, and headless Chromium emulating an iPhone 15.
- **Why:** on the iPhone, Google sign-in came back to `localhost`. The app had asked Supabase to return to `http://192.168.1.102:5173`, which wasn't in the dev project's Redirect URLs, so Supabase fell back to its Site URL.
- **How:**
  1. `curl` the dev server by IP and by `luiss-macbook-air.local`.
  2. Open the app by name, tap Sign in → Continue with Google, and intercept the request to `/auth/v1/authorize` before it leaves the browser, so nothing reaches Google.
- **Result:**
  - By IP: 200. By name: **403** ("Blocked request…") until `allowedHosts: ['.local']` was added to `vite.config.ts`, then 200.
  - The intercepted request had `provider=google` and `redirect_to=http://luiss-macbook-air.local:5179/`.
  - `code_challenge_method=plain`, with a console warning that WebCrypto isn't available. That's expected over plain HTTP on the Wi-Fi; the HTTPS live site uses the strong method.
- **Follow-up:** you added `http://luiss-macbook-air.local:5173/**` to the dev project's Redirect URLs.

### T-07 · Sign-ups refused · ✅
- **Where:** the dev project's public API.
- **How:** read `/auth/v1/settings`, then attempt `signUp` with a throwaway `probe-…@example.com` address. The attempt only runs if sign-ups report as disabled, so nothing is ever created.
- **Result:** `disable_signup: true`; the sign-up was refused with **422 `signup_disabled`** ("Signups not allowed for this instance").

### T-06 · End to end in three browsers against the dev project · ✅
- **Where:** the dev server with `.env.local` pointing at the dev project. Three separate headless Chromium profiles (A, B, C), standing in for three devices, each signed in as the test user via the dev-only `contentTrackerTest.signInWithPassword`.
- **How and result:**

  | Step | Result |
  | --- | --- |
  | A creates a project through the New project dialog | B shows it after **2.3 s**, live |
  | B ticks "Script" in the project detail | A's card shows **17%** after **2.3 s** |
  | A goes offline (`setOffline(true)`) and renames the project | A's account button reads "Offline. Changes will sync when you're back online." |
  | A comes back online | B shows the new name **0.8 s** later |
  | C, signed out, creates "Guest made …", then signs in | C is asked "This device has 1 project made while signed out. Add it to your account?"; after Add to account, A shows it in **2.8 s**, with a new color because blue was taken |
  | B's account menu → Sign out → Sign out | B's only IndexedDB database is the guest one, and the account's projects are gone from B |
  | A deletes both test projects | C drops them after **1.8 s** |

- No console errors.

### T-05 · Live updates (Supabase Realtime) · ✅
- **Where:** the dev project, from two Node clients both signed in as the test user.
- **How:** the listener subscribes to `postgres_changes` on `projects` and waits for "Subscribed to PostgreSQL". The other client then pushes a row through `sync_push`.
- **Result:** the listener heard the `INSERT`.
- **Note:** changes made before Supabase confirms "Subscribed to PostgreSQL" aren't announced (T-04 pushed too early and heard nothing). The sync engine covers that gap by pulling on start, on focus and every few minutes.

### T-04 · Dev project setup and access rules, through the public API · ✅ except two items
- **Where:** the dev project, with the publishable key only.
- **Result:**

  | Check | Result |
  | --- | --- |
  | Sign-in providers on | ✅ google, email |
  | Sign-ups disabled | ❌ `false`: sign-ups were still on. The sign-up attempt was skipped so no stray account would be created. Fixed by you and re-checked in T-07. |
  | Signed out: read `projects` | ✅ refused (`42501` permission denied) |
  | Signed out: call `sync_push` | ✅ refused (`42501`) |
  | Test user signs in | ✅ |
  | Test user reads its projects | ✅ 0 rows at first |
  | Test user reads `allowed_emails` | ✅ refused (`42501`) |
  | Push a project and its Publish subtask through `sync_push` | ✅ stored; `user_id` is the test user; `updated_at` set by the server |
  | Push an *older* edit of the same project | ✅ ignored; the title is unchanged |
  | Hard delete through the table API | ✅ refused (`42501`) |
  | Push a tombstone (`deleted: true`) | ✅ stored as deleted |
  | Live update heard | ⚠️ 0, inconclusive; see T-05 |

### T-03 · Signed-out sign-in UI · ✅
- **Where:** the dev server with placeholder Supabase settings, so the sign-in UI shows without a real project. Headless Chromium on desktop, and WebKit emulating an iPhone 15.
- **How:** look at the top bar, the ⋯ menu and the empty sidebar. Open the Sign in card and close it with Not now. Then open the app with `?error=access_denied&error_code=signup_disabled&…`, as a refused sign-in returns.
- **Result:**
  - The **Sign in** button shows on both widths.
  - The menu note reads "Saved on this device only. Sign in to keep your projects on all your devices."
  - The card opens and closes.
  - The refused sign-in shows "This Google account isn't allowed to use Content Tracker." and the address bar is tidied back to `/`.
  - The sidebar hint was first reported missing. Waiting for the data to load (about 25 ms after the button appears) showed it was a timing problem in the script; the hint is there.
  - No console errors.

### T-02 · Database migration and access-rule tests on a local Postgres · ⏳ not run
- **Why:** this Mac has the Postgres client tools but no Postgres server. Downloading a self-contained Postgres into the session's temporary folder was blocked by Claude Code's permission check.
- **To run:** `brew install postgresql@17`, then `npm run test:db`.
- T-04, T-07 and T-10 cover the same rules on the real dev project, except an account that exists but isn't on the allowlist.

### T-01 · The app signed out, after the local database gained new tables · ✅
- **Where:** the dev server with no Supabase settings, in headless Chromium on desktop.
- **How:**
  1. Load the sample data.
  2. Week view: tick a task, and tick Publish to get the archive prompt.
  3. Drag a task past its publish date and Cancel the prompt.
  4. Press Escape on a prompt shown over an open card.
  5. Reload.
- **Result:**
  - Progress reads 67% after the tick.
  - The archive prompt appears, and archiving works.
  - After Cancel the task stays on its day.
  - Escape closes only the prompt.
  - The week view is still chosen after the reload.
  - No console errors.

---

## Earlier work (before this log)

These checks were run as each piece was built; the details are in each PR or commit message.

- **Mobile layout (PR #2) and project bands on the phone (PR #3).**
  - iPhone 15 emulation in WebKit and Chromium: tabs, full-screen cards, prompts, and the phone month and week views.
  - Real touch drags in Chromium, through its developer protocol: the week list, and from the month's day list onto the grid.
  - A swipe that starts on a chip scrolls rather than dragging.
  - Export falls back to a download on desktop and phone.
  - Desktop drag and week view rechecked, with no regressions.
- **GitHub Pages deploy.**
  - The build served under `/content-tracker/` locally, then the live site.
  - Every file loads, including the favicon.
  - The production menu shows only Export and Import.
  - A project survives a reload.
  - `/content-tracker` without the slash redirects (301).
- **Milestone 5:** week view, in-app prompts (Cancel and Escape), and the view choice surviving a reload. Found and fixed: the view toggle's lowercase labels, and "overdue" being cut off.
- **Milestone 4:** ten drag scenarios, plus drags across week rows:
  - moves and edge resizes;
  - the prompt when a drop lands past the publish date (declined, then accepted);
  - Publish refused with a reason;
  - archived chips fixed in place;
  - drops off the grid cancelled;
  - a plain click still opening the card.
- **Milestone 3:**
  - the publish-date refusal, Shift project, saving as you type, adding subtasks, typing dates on the keyboard;
  - the new-project dialog, opening a card from a chip, ticking Publish to archive, reopening an archived project, persistence after a reload.

  Found and fixed: half-typed dates being saved, a half-typed end date clearing a range, and the title field taking focus when a card opened.
- **Milestone 2:** the month calendar with sample data, checked against the mockup's lanes, with screenshots of October and November.
