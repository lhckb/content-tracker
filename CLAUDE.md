# Content Tracker

A personal web app for planning Instagram and YouTube videos. Each video is a project with dated subtasks, shown as color-coded bands on a calendar with a progress bar per project.

The full spec is in @SPEC.md and is the source of truth. Read it before writing any code.

## How to work with me

- Ask clarifying questions instead of assuming whenever the spec is ambiguous or silent. Batch your questions; don't guess.
- Before touching code, run `node -v` and `npm -v`. If Node.js is missing or too old for the current Vite release, stop and walk me through installing the current LTS version.
- Start by proposing a plan for the milestones below, list your open questions, and wait for my go-ahead.
- Initialize a git repo and commit at the end of each milestone, then pause so I can try the app before you continue.
- Ask before adding any dependency not listed under Stack.
- Record every manual test (anything not part of `npm test`, done by hand or with a throwaway browser or API script) in `docs/testing/manual-tests.md`: what was checked, where, how, and the result, including failures and what was done about them. Log tests the user reports too.

## Milestones (whole MVP, in this order)

1. Scaffold, types, Dexie schema, data-access layer, JSON export/import.
2. Month calendar: project bands, lanes, subtask chips (single day and ranges), today, overdue, archived in gray. Sidebar with project cards, progress, Archive list.
3. Project detail, subtask card, and new-project dialog (with default template).
4. Drag and drop: move chips, resize ranges by their edges, guard rail on publish date, "Shift project".
5. Week view, then polish against SPEC.md's "MVP is done when" criterion.

## Stack (decided)

- React + TypeScript, built with Vite
- Dexie over IndexedDB; data lives in the browser only, with no backend and no login
- date-fns for all date math, dnd-kit for drag and drop, Tailwind CSS
- A custom calendar grid; no calendar library

## Architecture rules

- All reads and writes go through one data-access module in `src/data/`. Components never call Dexie directly, because this layer gets swapped for cloud sync after the MVP.
- Store dates as `YYYY-MM-DD` strings (whole days, no times). Never use `new Date('YYYY-MM-DD')`: it parses as UTC and shows the previous day in negative-offset time zones. Use date-fns `parseISO` and `format`.
- Subtask has `start` (required) and `end` (optional; empty means a single day).
- Compute derived values (a project's span, progress %, overdue state, lane assignment) at render time; never store them.
- Keep pure logic (lanes, span, progress, overdue, shifting) in plain TypeScript modules separate from components, so it can be tested.

## Behaviors that are easy to get wrong

- Publish is a special subtask locked to the project's publish date; it is always the last row of the subtasks (clean-up tasks are listed after it, in their own section) and counts toward progress.
- Progress = done subtasks ÷ total subtasks, all weighted equally, except clean-up tasks, which don't count.
- Overdue = the subtask's last day is before today and it isn't done. It shows a red chip outline, and the project card gets a red dot. Overdue subtasks never move on their own.
- A subtask can't end after the publish date, except clean-up tasks. If one is dropped there, prompt to push the publish date instead.
- Overlapping projects stack in lanes within each week row. A band continues across week rows.
- Weeks start on Sunday.
- About 8 preset colors, auto-assigned; no two active projects share one.
- Archived projects stay on the calendar in gray, are listed in the sidebar Archive, and can be reopened or restored.

## Out of scope for the MVP

Do not build any of these: Instagram or YouTube API integration, notifications, file attachments, time-of-day scheduling, or recurring projects. (Sign-in and sync came after the MVP; see below.)

## Sign-in and sync (added after the MVP)

The plan and its decisions are in `docs/plans/supabase-sync.md`.

- **Local-first.** Screens read and write only the device's Dexie database, as before. Signed out, that's the guest database. Signed in, it's a separate database per account, which `src/data/sync.ts` keeps in step with Supabase (Postgres in São Paulo) and Realtime.
- **Every write goes through `writing()`** in `src/data/db.ts`. In an account space, Dexie hooks record each change in the `pending` table within the same transaction. Don't write to the tables any other way, and never use `clear()`, which skips the hooks.
- **Governance:** four independent locks keep strangers out:
  1. Google sign-in stays in Testing mode;
  2. Supabase sign-ups are off;
  3. every database rule requires the email to be in `allowed_emails`;
  4. row-level security limits each user to their own rows.

  Never weaken one to make another work.
- **Database changes are SQL migrations** in `supabase/migrations/`, reviewed in a PR. `npm run test:db` checks the access rules against a local Postgres. Run a new migration in the dev project while building, and in production **before** merging the app change that needs it. Keep migrations compatible with the app version already live (e.g. a new `sync_push` argument gets a default).
- **Keys:** the app only ever uses the publishable key. The service-role key never goes in the app, the repo or `.env.local`.
- **Configuration:** builds without `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (see `.env.example`) run signed-out only.

## Ideas (added after the MVP)

The plan and its decisions are in `docs/plans/ideas.md`.

- **An area of its own:** a Calendar | Ideas switch in the top bar on desktop, an Ideas tab on the phone. Ideas never appear on the calendar, in the sidebar, in progress, or in color assignment.
- **Data:**
  - `src/data/ideas.ts`, with `useIdeas()` kept apart from `useTrackerData()`;
  - a synced `ideas` table, the same in Dexie and Postgres;
  - grouping by month in `src/lib/ideas.ts`.
- **Make project** calls `makeProjectFromIdea`. It creates the project and deletes the idea in one `writing()` transaction, so sync never sees one without the other.
- **Backups** are format version 2, which includes ideas. Version 1 files still import and leave ideas alone.

## Clean-up tasks (added after the MVP)

The plan and its decisions are in `docs/plans/cleanup-tasks.md`.

- **A third kind of subtask, `'cleanup'`,** for the work after a video is out. Clean-up tasks are dated and sit on the calendar with a broom icon. They:
  - don't count toward progress;
  - aren't ticked when Publish is ticked;
  - may fall after the publish date: the guard rail and `setPublishDate` ignore them;
  - move with Shift project.
- **The band** runs on past Publish, lighter, to the last clean-up task (`main` and `tail` in `BandSegment`).
- **Wrapping up:**
  - A project whose Publish is ticked but that isn't archived sits under Wrapping up in the sidebar (`isWrappingUp` in `src/lib/cleanup.ts`), and keeps its color.
  - Ticking Publish offers to archive only when no clean-up task is open. Otherwise ticking the last clean-up task makes the offer (`setDone` in `src/components/actions.ts`).
- **Backups** are format version 3. Versions 1 and 2 still import.

## Phone layout (added after the MVP)

Below 768px wide (`PHONE_QUERY` in `src/hooks/useMediaQuery.ts`, Tailwind `max-md:`), the sidebar becomes a Projects tab in a bottom tab bar (Calendar · Projects · Ideas), cards open as full-screen sheets, and the calendar switches to `PhoneMonth`/`PhoneWeek` in `src/components/calendar/PhoneCalendar.tsx`. Touch drags start with press-and-hold. The desktop layout is unchanged, so check both widths when changing UI. The app is meant to be added to the iPhone Home Screen from Safari.

## Commands

- `npm run dev`: dev server at http://localhost:5173
- `npm run dev:phone`: the same, reachable from a phone on the same Wi-Fi at http://luiss-macbook-air.local:5173 (the Mac's network name, allowed in `vite.config.ts`). For Google sign-in to return there, that address must be in the dev Supabase project's Redirect URLs. Over plain HTTP the sign-in falls back to a weaker code check (a console warning); the HTTPS live site doesn't.
- `npm run build`: typecheck, then production build into `dist/`
- `npm run typecheck`: TypeScript only (`tsc -b`)
- `npm test`: Vitest, once; `npm run test:watch` to rerun on save. Tests run in `America/Los_Angeles` so UTC date-parsing bugs fail, and use fake-indexeddb, so data-layer tests need no browser.
- `npm run lint`: Oxlint
- `npm run test:db`: applies `supabase/migrations` to a throwaway local Postgres and runs the access-rule tests (needs a Postgres server, e.g. `brew install postgresql@17`, or `PG_BIN`)
- Pull requests: `.github/workflows/ci.yml` runs the tests, lint and build on every PR. Branch protection on `main` requires that check ("Tests, lint and build") to pass before merging.
- Deploy: push to `main`. `.github/workflows/deploy.yml` runs the tests, lint and build, then publishes `dist/` to https://lhckb.github.io/content-tracker/. The build uses relative asset paths (`base: './'`), so it works under that sub-path.
