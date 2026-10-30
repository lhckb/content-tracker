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

## Branch `notifications`: daily reminders (2026-10-30)

### T-28 · The Notifications card, the service worker, and turning on before the dev migration · ✅
- **Where:** the dev server on 5179, with `.env.local` (dev project) plus a throwaway `VITE_VAPID_PUBLIC_KEY` (public half only). Each check uses its own fresh browser profile.
  - Desktop runs in full Chromium in new headless mode. Playwright's default headless shell always reports notifications as "denied", and the card rightly showed "blocked" there.
  - Phone runs in WebKit emulating an iPhone 15.
  - Signed-in checks use the dev test user.
- **How and result:**

  | Check | Result |
  | --- | --- |
  | The service worker at startup | Registered, `http://localhost:5179/sw.js` |
  | Signed out: ⋯, Notifications… | "Sign in to get notifications. They count the tasks in your account." The switch and the time (08:00) are disabled, and the line reads 'Every day at 8:00 AM: "You have 3 tasks for 2 projects today, plus 1 overdue." Nothing on days with nothing to do.' |
  | Pushes delivered to the service worker through Chromium's DevTools (`ServiceWorker.deliverPushMessage`) | It shows "You have 2 tasks for 1 project today", with tag `daily-reminder` and the app's icon. The next push replaces it rather than adding a second notification. A push that isn't the function's JSON shows "Content Tracker". |
  | Signed in, permission granted | The switch is off and can be used, with no reason shown. Typing 07:30 updates the line to "7:30 AM" after a pause. |
  | Turning on, before the dev project has the migration (a stand-in replaces `PushManager.subscribe`, since headless browsers can't reach a real push service) | The card shows "Couldn't turn on reminders: Could not find the table 'public.push_subscriptions' in the schema cache". The new subscription is dropped again, and the switch stays off. |
  | Signed in, `Notification.permission` denied | "Notifications are blocked for Content Tracker. Allow them in your device's settings, then come back here." The switch is disabled. |
  | iPhone Safari tab (WebKit, `navigator.standalone` false, no `PushManager`) | "On iPhone, notifications work in the Home Screen app. In Safari, tap Share, then Add to Home Screen." The card fills the screen (393×659). |
  | Plain Playwright WebKit as an iPhone, with nothing stubbed | It reports the same as an iPhone Safari tab. |

- **Console:** the one error is the 404 for the missing table, in the turning-on check.
- **Waits for your dev setup:** turning on for real, changing the time, turning off, signing out, and a reminder arriving.

### T-27 · The daily-reminder function, run for real under Deno against stand-ins · ✅
- **Why:** the function can't run on Supabase until you've set it up there, and Vitest only covers its logic, not how it uses web-push and supabase-js.
- **Where:** Deno 2.9.5 on the Mac. The real `supabase/functions/daily-reminder/index.ts` runs with its own `deno.json`, as Supabase would run it.
- **How:** a script does the following.
  1. It runs `scripts/notification-keys.mjs` and gives the function the keys and token it prints.
  2. It points the function at two stand-ins:
     - a fake database API (PostgREST) that only answers callers with the secret key, sent in `SUPABASE_SECRET_KEYS`. Its `claim_due_reminders` returns three devices: one the push service accepts, one it answers 410 (gone), and one it answers 429 (busy).
     - a fake HTTPS push service that verifies each push's VAPID signature and decrypts the push with the device's private key.
  3. It calls the function with a wrong token, then with the right one.
- **Result:**
  - The script prints one public key for both the app and the function, and its Vault lines use the function's address and the same token.
  - A wrong token gets **403**.
  - The real call gets `{"due":3,"sent":1,"gone":1,"failed":1}`.
  - The accepted push decrypts to "You have 3 tasks for 2 projects today, plus 1 overdue". Its signature verifies, its `sub` is the live site's address, and it has `TTL: 21600`, `Urgency: normal` and `Topic: daily-reminder`.
  - `forget_push_subscriptions` gets exactly the gone device's address.
  - The function's log says "A push was refused (429)." and never prints a device's address.
- **Test-only setup:** the fake push service's certificate is self-signed, so the function's process was given `NODE_EXTRA_CA_CERTS` and `--allow-sys=ca`. Supabase's real push services have ordinary certificates.

### T-26 · The scheduled job's SQL, against stand-ins for pg_net and Vault · ✅
- **Why:** `npm run test:db` skips scheduling the job, because a plain Postgres has neither pg_cron nor pg_net. So the job's SQL, which runs every minute on Supabase, isn't covered there.
- **Where:** a throwaway local Postgres 17, with the shim and every migration loaded.
- **How:** a script stands in for `net.http_post` (same signature as pg_net's: `url`, `body`, `params`, `headers`, `timeout_milliseconds`), recording each call, and for `vault.decrypted_secrets`, holding a made-up address and token. It runs the job's SQL, copied out of the migration, twice: with no device due, then with one device whose time is the current minute.
- **Result:**
  - The migration reports "pg_cron or pg_net is missing, so the daily reminder job is not scheduled." and carries on.
  - With no device due, the job makes **no** call.
  - With one due, it makes exactly one: to the address from Vault, with headers `Content-Type: application/json` and `x-reminder-token` from Vault, body `{}`, and a 30-second timeout.

### T-25 · `web-push` 3.6.7 under Deno · ✅
- **Why:** Supabase's Edge Functions run on Deno, not Node, and `web-push` is a Node library. A push that encrypts or signs wrongly is still accepted by the push service, but the phone drops it without a sign.
- **Where:** Deno 2.9.5 on the Mac.
- **How:** a script imports `npm:web-push@3.6.7` and makes a push for a made-up subscription. The subscription's keys come from the Web Crypto API, the way a browser makes them. The script then checks the request the way a browser and Apple would: it verifies the VAPID signature with the public key, then decrypts the body (RFC 8291, `aes128gcm`) with the subscription's private key.
- **Result:**
  - The request has `Content-Encoding: aes128gcm` and `TTL: 21600`.
  - The VAPID JWT verifies, with `aud` `https://web.push.apple.com` and `sub` the live site's address.
  - The body decrypts to the exact payload: `{"title":"You have 3 tasks for 2 projects today, plus 1 overdue"}`.

---

## Branch `cleanup-tasks`: clean-up tasks (2026-10-28)

### T-24 · Production after the clean-up migration, from outside · ✅ (what can be seen)
- **Where:** the production project's public API, with the publishable key only and signed out, after you ran the migration there.
- **How:** the same script as T-17.
- **Result:**
  - Everything is as in T-17: `ideas` and `projects` refuse signed-out reads (`42501`), `sync_push` still accepts both the three-list and the live app's two-list call, the made-up-argument control gets `PGRST202`, and sign-ups are off.
  - **Not visible from outside:** whether the kind check now allows `'cleanup'`. Signed-out writes are refused before that check runs, and production has no test user. Your first clean-up task on the live site confirms it. Had the migration not taken, the account button would show a sync error.

### T-23 · Clean-up tasks syncing between two browsers on the dev project · ✅
- **Where:** the dev server with `.env.local` pointing at the dev project, after you ran the migration there. Two separate headless Chromium profiles (A, B), both signed in as the test user.
- **How and result:**

  | Step | Result |
  | --- | --- |
  | A creates a project with the default clean-up tasks | B shows it after **2.8 s**, with both clean-up tasks in its Clean-up section |
  | A ticks "Clean-up task" on Thumbnail | B's open project shows Thumbnail under Clean-up after **2.3 s** |
  | B ticks Publish | B is told "Published · 3 clean-up tasks left"; A shows the project under Wrapping up, "Clean-up · 0 of 3 done", after **2.3 s** |
  | A ticks the three clean-up tasks | After the last one, A is offered to archive; after Archive, B drops it from its active cards after **1.8 s** and lists it in the Archive |
  | A deletes the project | B drops it after **2.3 s** |

- No console errors. Afterwards the test account had no live projects, subtasks or ideas.

### T-22 · The clean-up migration on the dev project, through the API · ✅
- **Where:** the dev project, as the test user, with the publishable key only.
- **How:** a Node script pushes a project with its Publish and a clean-up task on Nov 20 (after publish), then a subtask with an unknown kind, then tombstones for everything it stored.
- **Result:**
  - The clean-up task is accepted and stored as `cleanup` on Nov 20.
  - The unknown kind ("chore") is refused: `23514`, `subtasks_kind_check`. So the migration replaced the check under its expected name, rather than adding a second one.
  - Everything ends as tombstones, with 0 live rows in the test account.

### T-21 · Clean-up in the phone's Projects tab and project sheet · ✅
- **Where:** the dev server, signed out, in WebKit emulating an iPhone 15, with the sample data.
- **How:** open the Projects tab, then the wrapping-up project's sheet, then one of its clean-up tasks.
- **Result:**
  - The Projects tab has a Wrapping up group with "Clean-up · 1 of 3 done".
  - The sheet has the Clean-up section, with its three rows and "+ Add clean-up task".
  - The subtask card's "Clean-up task" box is ticked.
  - No console errors.

### T-20 · Clean-up in the panels and sidebar on desktop · ✅
- **Where:** the dev server, signed out, in headless Chromium at 1440×900, with the sample data.
- **How and result:**

  | Step | Result |
  | --- | --- |
  | Sidebar | "Packing tips Reel" sits under Wrapping up, reading "published Oct 25" and "Clean-up · 1 of 3 done", with the red dot (overdue clean-up) |
  | Open it | Progress reads "3 of 3 done · 100%", leaving clean-up out. Below the subtasks, "Clean-up · 1 of 3 done" with three rows |
  | Archive project | Asks "2 clean-up tasks aren't done. Archive anyway?"; Cancel keeps it |
  | Tick one of the two open clean-up tasks | No offer |
  | Tick the last one | Offers: '"Packing tips Reel" is published and its clean-up is done. Archive the project?'; declined, the card reads "Ready to archive" |
  | Untick Publish | The project goes back to Active projects |
  | + New project | "Start with default clean-up tasks" starts ticked. The new project shows "0 of 6 done", with "Back up raw footage" and "Share on Instagram Stories" on Nov 21, the day after publish |
  | Tick its Publish | Notice "Published · 2 clean-up tasks left", no archive offer; every regular subtask ticked, the clean-up tasks not; the project moves to Wrapping up |
  | + Add clean-up task | Starts on the day after publish; one added on Nov 24 asks nothing and joins the Clean-up section |
  | Subtask card: tick "Clean-up task" on Edit, then untick it | It moves to the Clean-up section and back, with no prompt (it ends before publish) |
  | Untick "Clean-up task" on the Nov 24 one | Offers to push the publish date to Nov 24; Cancel leaves it a clean-up task |
  | Ideas → Make project | The dialog has the clean-up box, ticked |

- No console errors.
- **Found and fixed:** on a wrapping-up card in the desktop sidebar, "Instagram · published Oct 25" was too wide and wrapped after "Oct". The card now shows "published Oct 25" next to the platform icon, and screen readers still hear "Instagram".
- **The script's first run stopped** at the first checkbox. Playwright's `check()` looks at a checkbox straight after the click, but the app's boxes change only once the save lands, a moment later. The script now clicks and waits.

### T-19 · Clean-up tasks on the phone calendar · ✅
- **Where:** the dev server, signed out, in WebKit emulating an iPhone 15, with the sample data. Today was 2026-10-28.
- **How:** in the month view, tap Oct 27; then switch to the week view.
- **Result:**
  - The month lanes and the week view's day lines carry the wrapping-up project's band on past its Publish (Oct 25), in a lighter tint, to its last clean-up task.
  - Oct 27's list shows "Back up raw footage" with the broom, a red outline and "Overdue · Clean-up · Packing tips Reel". Its label reads "…Back up raw footage, clean-up, Oct 27, overdue".
  - No console errors.

### T-18 · Clean-up tasks on the desktop calendar · ✅
- **Where:** the dev server, signed out, in headless Chromium at 1440×900, with the sample data.
- **How and result:**

  | Step | Result |
  | --- | --- |
  | October, month view | The wrapping-up project's band runs on past Publish (Oct 25) in a lighter tint to its last clean-up task (Oct 30). Clean-up chips show a broom. The overdue one (Oct 27) has the red outline |
  | November: drag the in-progress project's clean-up task from Nov 7 to Nov 9, after its Publish (Nov 6) | No prompt to push the publish date. The chip lands on Nov 9 and the lighter part stretches to it |
  | Week view, Oct 25–31 | Clean-up chips show the broom, and their second line reads "Clean-up · Packing tips Reel" |

- No console errors.
- **The script's first two runs failed** before reaching the drag, both its own mistakes:
  - it looked for the Nov 7 chip while October was showing;
  - it then dropped on Monday of the wrong week row, landing on Nov 2. The app handled that correctly: a clean-up task before Publish is allowed (decision K), and the lighter part disappeared since nothing was left after Publish.

---

## Branch `ideas`: the Ideas area (2026-10-28)

### T-17 · The ideas migration on production, from outside · ✅
- **Where:** the production project's public API, with the publishable key only and signed out, after you ran the migration there.
- **How:**
  - Read the tables and call `sync_push` signed out. `42501` means the object exists and refuses anyone signed out; "not found" (`PGRST205` for a table, `PGRST202` for a function) would mean the migration hadn't run.
  - As a control, call `sync_push` with a made-up argument.
- **Result:**

  | Check | Result |
  | --- | --- |
  | Read `ideas` | ✅ refused (`42501`): the table exists |
  | Read `projects` | ✅ refused (`42501`) |
  | `sync_push` with `idea_rows` | ✅ refused (`42501`): the new function exists |
  | `sync_push` with two lists, as the live app sends | ✅ refused (`42501`): still matches, so the live app keeps syncing |
  | `sync_push` with a made-up argument (control) | ✅ `PGRST202` "Could not find the function": a missing function would have shown |
  | Sign-ups | ✅ still off; Google the only provider |

### T-16 · Ideas syncing between three browsers on the dev project · ✅
- **Where:** the dev server with `.env.local` pointing at the dev project, after you ran the ideas migration there. Three separate headless Chromium profiles (A, B, C) stand in for three devices; A and B are signed in as the test user from the start.
- **How and result:**

  | Step | Result |
  | --- | --- |
  | A adds an idea in YouTube | B shows it after **2.3 s** |
  | B sets February and a description on it | A shows it under February 2027, with the description, after **2.3 s** |
  | A uses Make project on it and creates the project | A moves to the calendar; B drops the idea after **1.8 s**, and B's copy of the project has the description as its notes |
  | C, signed out, adds an Instagram idea, then signs in | C is asked "This device has 1 idea made while signed out. Add it to your account?"; after Add to account, A shows it after **2.3 s** |
  | A deletes the project and the idea | C drops the idea after **1.8 s**, and the project too |

- No console errors.
- **First run:** the script failed partway, its own mistake. It waited for A's Ideas column right after Make project, when A had moved to the calendar as designed. Fixed: the script switches back to Ideas first, and now cleans up every test project and idea, including those the first run left.
- **Afterwards:** through the API, the test account had no live projects or ideas, only tombstones. One live subtask was left over from yesterday's T-04 probe: that probe deleted its "Probe" project through the API but not the project's Publish subtask, something the app never does. It would have made an exported backup refuse to import ("belongs to no project"), so it was tombstoned too. The test account now has 0 live rows.

### T-15 · The ideas migration on the dev project, through the API · ✅
- **Where:** the dev project, with the publishable key only; signed out, then as the test user.
- **How:** a Node script, the same way as T-04 and T-05. The idea it stores ends as a tombstone.
- **Result:**

  | Check | Result |
  | --- | --- |
  | Signed out: read `ideas` | ✅ refused (`42501`) |
  | Signed out: call `sync_push` | ✅ refused (`42501`) |
  | The previous app's two-list `sync_push` call | ✅ still works |
  | Push an idea with a month | ✅ stored with the test user's id; `updated_at` set by the server |
  | Push an older edit | ✅ ignored |
  | Push a newer edit that clears the month | ✅ applied; month null |
  | Push a month of "March 2027" | ✅ refused (`23514`, the month check) |
  | Hard delete through the table API | ✅ refused (`42501`) |
  | Other users' ideas visible | ✅ none |
  | Live update on `ideas` (after "Subscribed to PostgreSQL") | ✅ heard the `UPDATE` |
  | The probe idea at the end | ✅ a tombstone |

### T-14 · Ideas on the phone · ✅
- **Where:** the dev server, signed out, in WebKit emulating an iPhone 15, with the sample data.
- **How:**
  1. Tap the Ideas tab, then switch to Instagram.
  2. Add "Rainy day b-roll" with the Add button.
  3. Open it, pick December and type a description.
  4. Make project, set a publish date, and Create.
- **Result:**
  - There's no Calendar | Ideas switch at this width; the tab bar has Calendar · Projects · Ideas.
  - One column shows at a time, and the switch flips between YouTube and Instagram.
  - The idea card is a full-screen sheet.
  - The New project dialog starts from the idea and shows "Planned for December 2026".
  - After Create, the project detail opens with the description as its notes, and closing it lands on the Calendar tab. The idea has left Ideas.
  - No console errors.
  - The one ❌ in the script was its own mistake: it expected the sheet to be at least 800 points tall, but the emulated iPhone 15 screen is 393×659, and the sheet filled it.

### T-13 · Ideas on desktop · ✅
- **Where:** the dev server, signed out, in headless Chromium at 1440×900, with the sample data. Today was 2026-10-28.
- **How and result:**

  | Step | Result |
  | --- | --- |
  | Top bar: Calendar → Ideas | The calendar and the sidebar hide; two columns, "YouTube · 3" and "Instagram · 3" |
  | Month headings | YouTube: November 2026, January 2027, No month. Instagram: September 2026 · past, October 2026, No month |
  | Type a title in YouTube's "Add an idea…" and press Enter | Added first under No month; the field clears and keeps focus. Enter on an empty field adds nothing |
  | Open it: the year list before a month is picked | Disabled |
  | Pick March | The year becomes 2027 (March's next occurrence) |
  | Pick 2028 and type a description | The card moves under March 2028 and shows the description |
  | Switch the card to Instagram, then pick No month | It moves to the Instagram column, under No month |
  | Make project on "Studio lighting on a budget", then Cancel | The idea stays |
  | Make project again | Title and YouTube filled in; "Planned for November 2026" shown; publish date empty and focused; Create disabled |
  | Set the date, then Create | Switches to Calendar; the project detail opens with the idea's description as its notes and 0 of 6 done; the project is in the sidebar; the idea has left Ideas |
  | Delete idea, then confirm | Removed |
  | Reload | Ideas is still the chosen area |
  | Back on the calendar | No idea titles on it |

- No console errors.
- The script's one ❌ was its own mistake: it expected "· PAST" in capitals, but the "past" marker is deliberately lowercase.

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

### T-02 · Database migration and access-rule tests on a local Postgres · ✅ (first run 2026-10-30, after a fix)
- **Why it waited:** until 2026-10-30, this Mac had the Postgres client tools but no Postgres server. Downloading a self-contained Postgres into the session's temporary folder was blocked by Claude Code's permission check.
- **Setup:** `brew install postgresql@17`. Homebrew's post-install step didn't run the first time, so Postgres couldn't find its own files (`initdb: file ".../share/postgresql@17/postgres.bki" does not exist`). Running `brew postinstall postgresql@17` fixed it.
- **First run:** ❌ The first 20 checks passed, then "Bob cannot update Alice's project" stopped the run: `WITH clause containing a data-modifying statement must be at the top level`. The check had put its `update` in a subquery. So that check and the ones after it had never run, though the migrations themselves loaded fine.
- **Fix:** on the `notifications` branch, the check runs its `update` at the top level and checks the result. `run-local.sh` now also finds Homebrew's Postgres 17 without `PG_BIN`.
- **Result:** ✅ all 68 checks pass: the 36 from before, plus 32 daily-reminder checks added on that branch.
- T-04, T-07 and T-10 cover the same rules on the real dev project, except an account that exists but isn't on the allowlist. Here, that's Carol.

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
