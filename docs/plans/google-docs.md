# Plan: Google Docs

Status: built on branch `google-docs`, steps 1–5, 2026-11-05. You answered A–E and chose the recommendation each time. F–L were my defaults, accepted with the go-ahead. The migration has run on dev (T-34), and the button works end to end with Google faked (T-37).

Still to do:
1. You: steps 1–3 of "Setting up Google Cloud" below. The client ID needs nothing from you: it's the one Google sign-in already uses, the same for dev and production, and it's now in `.env.local`.
2. The check with your real Google account on localhost (T-38).
3. You run the migration on production; I check it from outside (T-39).
4. You set the GitHub variable and merge; then the live site and the iPhone (T-40).

## Changes while building

- **Google's script loads when a card with the button opens,** not on the first click. Still not at startup. Loading it on the click would often get Google's window blocked, since browsers block windows opened long after a click.
- **The doc opens in a new tab on the click only when no Google window is needed** (a token is in hand). Google's window uses up the click, so then a notice says the doc was made, and the button opens it. In the iPhone's Home Screen app the button is always the way in, since a new tab would leave the app.
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
  - **Create Google Doc** → **Creating…** while it works.
  - **Open Google Doc** once a doc exists. It's a plain link to the doc, opening in a new tab.
  - Next to it, a small **Make a new copy** link (decision L) for when the doc was deleted in Drive or you want a fresh copy of the notes. It asks first, then makes a new doc and points the button at it. The old doc is left alone.
- **First use:** Google asks, in a small popup, to let Content Tracker "see, edit, create and delete only the specific Google Drive files you use with this app". Afterwards the popup only reappears, briefly, when the hour-long token has run out.
- **After creating:** the doc opens in a new tab where the browser allows it. If the browser blocks the tab (Safari can, after a popup), the button already reads **Open Google Doc**.
- **Errors** (decision K): offline, popup closed, or Google refusing → a toast says what happened, and nothing is saved.

## How it works

### The Google token

- **Google's sign-in script** (`https://accounts.google.com/gsi/client`, decision E) asks for an access token with the `drive.file` scope. It's loaded on the first click, not at startup.
- **Not Supabase's token.** Supabase hands over Google's token only at the moment of sign-in and never refreshes it, so it would stop working after an hour.
- **The same account:** the request passes your signed-in email as a hint, so Google suggests that account.
- **Kept in memory only,** until it expires. It's never written to Dexie, localStorage or Supabase, and never sent anywhere but Google.
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
3. **Clients → the Web client → Authorized JavaScript origins:** check that `https://lhckb.github.io` and `http://localhost:5173` are there.
4. **The client ID:** nothing to do. It's the client Supabase already uses for Google sign-in, in both projects. I read it from their public sign-in redirect to Google, and it's in `.env.local`. It's public by design.
5. **GitHub:** run `gh variable set VITE_GOOGLE_CLIENT_ID --body "913587664475-5fttvl4hkq1oab003cg6f1u6q4dhquvq.apps.googleusercontent.com"`.

## The four locks

None change. The Google app stays in Testing mode, and only its test users can grant the scope. Supabase sees only the doc id, through the usual rules.

## Steps

One branch (`google-docs`), one PR, one commit per step.

1. **Setup** (you): "Setting up Google Cloud" above. I add the client ID to `.env.local`, `.env.example` and `deploy.yml`.
2. **Data:** `docId`, the migration, sync rows, `makeProjectFromIdea`, backup v4. Tests: data, sync, backup, and `npm run test:db`. I run the migration on dev; you run it on production before merging.
3. **Google:** `src/data/googleDocs.ts`, which gets the token and creates the folder and the doc. Tests with a faked `fetch` and a faked Google script.
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
| Google's popup doesn't work in the iPhone Home Screen app | The phone leaves for Google's page and comes back, as sign-in does, then finishes the doc. A follow-up PR, if the live-site check fails |
| Safari blocks the new tab after the popup | The button already reads Open Google Doc |
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

**Defaults I chose (change any before work starts):**

- **F.** Empty notes still make a doc, empty.
- **G.** The body is only the notes: no title heading, platform or subtasks.
- **H.** Make project carries the idea's doc over to the project.
- **I.** Renaming doesn't rename the doc.
- **J.** Archived projects keep the button.
- **K.** Offline or refused: a toast says why, and nothing is saved.
- **L.** A small "Make a new copy" link next to Open Google Doc replaces the link with a fresh doc.
