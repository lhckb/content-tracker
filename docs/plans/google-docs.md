# Plan: Google Docs

Status: built on branch `google-docs`, steps 1–5, 2026-11-05, then reworked after your first real try (T-38). You answered A–E and chose the recommendation each time. F–L were my defaults, accepted with the go-ahead. E is now superseded (see below). The migration has run on dev (T-34), and the reworked flow works end to end with Google faked (T-41).

Still to do:
1. You: steps 1–3 of "Setting up Google Cloud" below. Step 3 is new: two redirect addresses. The client ID needs nothing from you: it's the one Google sign-in already uses, the same for dev and production, and it's now in `.env.local`.
2. The check with your real Google account on localhost, again (T-42).
3. You run the migration on production; I check it from outside (T-39).
4. You set the GitHub variable and merge; then the live site and the iPhone (T-40).

## Changes while building

- **No Google script and no popup (supersedes decision E).** Your first real try (T-38) found two problems with Google's popup:
  - after you allowed access, the popup closed and nothing happened;
  - once it worked, the doc didn't open on its own.

  A click may open only one window, and the popup used it up. Now the click opens a new tab that goes to Google itself. The first time, the tab shows Google's consent; after that Google passes straight through. Google then sends the tab back to `google-callback.html`, the app makes the doc, and that tab becomes the doc. With a token already in hand, the tab skips Google.
- **The iPhone's Home Screen app** goes to Google and back in the same window, as sign-in does, because a new tab would leave the app. Back in the app, it makes the doc, reopens its card and says so. This was the follow-up in the risks table, done now because the popup is gone.
- **The doc id is checked** to look like a Drive file id (letters, digits, `-` and `_`, up to 200) in the app, in backups and in the database. A damaged backup or row can't become a link somewhere else.
- **Make a new copy asks:** "Make a new Google Doc from the notes as they are now? The button will open the new doc. The current one stays in your Drive."

## Goal

A button on a project and on an idea that creates a Google Doc with the same name, holding a copy of its notes (an idea's description). The project or idea remembers its doc, so from then on the button opens it, on every device.

The copy is made once. After that the notes and the doc are separate: editing one never changes the other.

## Screens

- **Project detail:** a **Create Google Doc** button on the right of the **Notes** heading.
- **Idea card:** the same button on the right of the **Description** heading.
- **Phone:** the same place in both full-screen sheets.
- **States of the button:**
  - Hidden when signed out (decision D), or when the build has no Google client ID.
  - **Create Google Doc** → **Waiting for Google…** while the new tab is at Google (still clickable, to start again if that tab was closed) → **Creating…** while the doc is made.
  - **Open Google Doc** once a doc exists. It's a plain link to the doc, opening in a new tab.
  - Next to it, a small **Make a new copy** link (decision L) for when the doc was deleted in Drive or you want a fresh copy of the notes. It asks first, then makes a new doc and points the button at it. The old doc is left alone.
- **The click opens a new tab at once.** The first time, it shows Google asking to let Content Tracker "see, edit, create and delete only the specific Google Drive files you use with this app". After that, Google passes straight through, briefly, whenever the hour-long token has run out. Either way the tab goes on to make the doc and ends on it.
- **In the iPhone's Home Screen app,** the app itself goes to Google and back, then reopens the card with **Open Google Doc** and a notice.
- **Errors** (decision K): offline, access refused, or Google or Drive refusing → the tab and a toast say what happened, and nothing is saved. A blocked tab gets a toast asking to allow pop-ups.

## How it works

### The Google token

- **A trip to Google** (`src/lib/googleAuth.ts`): Google's OAuth page, asked for an access token (`response_type=token`) with the `drive.file` scope and a random `state`. Google sends the tab back to `google-callback.html` with the token after `#`. That page takes it out of the address at once, and gives it to the app tab that asked, over a `BroadcastChannel` that only this site's pages share. The app answers with the doc's id, and the page goes to the doc.
- **The callback page is separate from the app,** so Supabase's sign-in, which reads tokens from the app's address, never sees Google's.
- **In the Home Screen app,** the request and Google's answer pass through `sessionStorage` for the length of the round trip, then are deleted.
- **Not Supabase's token.** Supabase hands over Google's token only at the moment of sign-in and never refreshes it, so it would stop working after an hour.
- **The same account:** the request passes your signed-in email as a hint, so Google suggests that account.
- **Kept in memory only,** until it expires. It's never written to Dexie, localStorage or Supabase, and never sent anywhere but Google. The one exception is the Home Screen app's round trip, above.
- **`drive.file`** reaches only files the app made. The app can't see or change anything else in your Drive.

### Making the doc

All through the Drive API with plain `fetch`; no npm package.

1. **The folder** (decision C): find the "Content Tracker" folder the app made earlier; if there's none (never made, or trashed), make it. With `drive.file` the search only sees the app's own folders.
2. **The doc:** one multipart `files.create` upload, with the name, the folder, the type `application/vnd.google-apps.document`, and the notes as plain text. Drive converts it into a Google Doc. Empty notes make an empty doc (decision F). The body is only the notes (decision G).
3. **The link:** the returned file id is saved on the project or idea. The URL (`https://docs.google.com/document/d/<id>/edit`) is built from it when shown, not stored.

The Docs API isn't needed: Drive's upload creates the doc and puts it in the folder in one call.

## Data

### On the device

- `Project` and `Idea` gain `docId?: string`, absent until a doc is made.
- No new Dexie version: the field isn't indexed.
- **Data functions:** `setProjectDoc(projectId, docId)` and `setIdeaDoc(ideaId, docId)`, through `writing()` like every other write, so the link syncs.
- **Make project** (decision H): `makeProjectFromIdea` copies the idea's `docId` to the new project.
- **Renaming** a project or idea doesn't rename the doc (decision I).
- **Archived projects** keep the button (decision J).

### On the server

A new migration, `supabase/migrations/20261103120000_google_docs.sql`:

- A nullable `doc_id text` column on `projects` and `ideas`.
- `sync_push` (same signature) also writes `doc_id`, as `coalesce(excluded.doc_id, p.doc_id)`. A device still running the previous version sends rows without it, and that must not wipe a link. The app never needs to clear one: **Make a new copy** replaces it.
- The access rules are untouched.

### Backups

Format version 4, with `docId` on projects and ideas. Versions 1–3 still import.

## Setting up Google Cloud

You do this once, in the Google Cloud project used for sign-in:

1. **APIs & Services → Library:** enable the **Google Drive API**.
2. **Google Auth Platform → Data access → Add or remove scopes:** add `…/auth/drive.file` and save. It's a non-sensitive scope, so Testing mode is enough.
3. **Clients → the Web client → Authorized redirect URIs:** add `https://lhckb.github.io/content-tracker/google-callback.html` and `http://localhost:5173/google-callback.html`, next to Supabase's ones. Google only sends a token back to an address on this list. The JavaScript origins asked for earlier aren't needed any more, but they do no harm.
4. **The client ID:** nothing to do. It's the client Supabase already uses for Google sign-in, in both projects. I read it from their public sign-in redirect to Google, and it's in `.env.local`. It's public by design.
5. **GitHub:** run `gh variable set VITE_GOOGLE_CLIENT_ID --body "913587664475-5fttvl4hkq1oab003cg6f1u6q4dhquvq.apps.googleusercontent.com"`.

## The four locks

None change. The Google app stays in Testing mode, and only its test users can grant the scope. Supabase sees only the doc id, through the usual rules.

## Steps

One branch (`google-docs`), one PR, one commit per step.

1. **Setup** (you): "Setting up Google Cloud" above. I add the client ID to `.env.local`, `.env.example` and `deploy.yml`.
2. **Data:** `docId`, the migration, sync rows, `makeProjectFromIdea`, backup v4. Tests: data, sync, backup, and `npm run test:db`. I run the migration on dev; you run it on production before merging.
3. **Google:** `src/data/googleDocs.ts`, which gets the token and creates the folder and the doc. Tests with a faked `fetch` and Google's answer faked. (Reworked after T-38: a tab to Google and `google-callback.html`, with `src/lib/googleAuth.ts`.)
4. **Buttons:** in the project detail and the idea card, checked at desktop and phone widths.
5. **Docs:** a CLAUDE.md section, this plan's status, and the manual tests.

## Testing

- **Unit:** the Drive requests (folder search, multipart body), token reuse and expiry, the error toasts, the `docId` round trip through sync and backups, and Make project carrying the link.
- **Database:** `npm run test:db`, plus a check that a row pushed without `doc_id` keeps the stored one.
- **Manual** (from T-34, in `docs/testing/manual-tests.md`):
  - With a real Google account, on `localhost:5173` against dev: the first consent, the folder, the doc's name and text, Open, Make a new copy, the link appearing on a second browser.
  - The live site on desktop and in the iPhone's Home Screen app, after merging. Google doesn't accept plain-HTTP addresses other than localhost, so `npm run dev:phone` can't test it.

## Risks

| Risk | What then |
| --- | --- |
| The round trip doesn't work in the iPhone Home Screen app | Sign-in makes the same trip and works there (T-09); checked on the live site (T-40) |
| The browser blocks the new tab | A toast asks to allow pop-ups for the site. The tab opens straight from the click, so browsers allow it |
| The Google tab is closed halfway | The button reads Waiting for Google…; clicking it starts again |
| The doc is deleted in Drive | Make a new copy |
| The "Content Tracker" folder is trashed or renamed | A new folder is made on the next doc |
| A device on the old version edits a project | `sync_push` keeps the stored `doc_id` |

## Decisions

**A. Should a project or idea remember its doc?**
- Remember it: the button becomes "Open Google Doc", synced across devices.
- Don't: every click makes a new doc.

A: remember it.

**B. When the notes change later?**
- A one-time copy.
- An "Update doc from notes" action that overwrites the doc.

A: a one-time copy.

**C. Where in Drive?**
- A "Content Tracker" folder.
- The top level of My Drive.

A: a "Content Tracker" folder.

**D. Signed out?**
- Signed in only.
- Always.

A: signed in only.

**E. Google's sign-in script?**
- Yes, for the popup.
- No: leave for Google and come back each time the token expires.

A: yes.

Superseded 2026-11-05, after your first real try (T-38): no Google script; a new tab goes to Google and back. See "Changes while building".

**Defaults I chose (change any before work starts):**

- **F.** Empty notes still make a doc, empty.
- **G.** The body is only the notes: no title heading, platform or subtasks.
- **H.** Make project carries the idea's doc over to the project.
- **I.** Renaming doesn't rename the doc.
- **J.** Archived projects keep the button.
- **K.** Offline or refused: a toast says why, and nothing is saved.
- **L.** A small "Make a new copy" link next to Open Google Doc replaces the link with a fresh doc.
