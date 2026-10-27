# Content Tracker

A personal web app for planning Instagram and YouTube videos. Each video is a project with dated subtasks, shown as color-coded bands on a calendar with a progress bar per project.

The full spec is in @SPEC.md and is the source of truth. Read it before writing any code.

## How to work with me

- Ask clarifying questions instead of assuming whenever the spec is ambiguous or silent. Batch your questions; don't guess.
- Before touching code, run `node -v` and `npm -v`. If Node.js is missing or too old for the current Vite release, stop and walk me through installing the current LTS version.
- Start by proposing a plan for the milestones below, list your open questions, and wait for my go-ahead.
- Initialize a git repo and commit at the end of each milestone, then pause so I can try the app before you continue.
- Ask before adding any dependency not listed under Stack.

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

- Publish is a special subtask locked to the project's publish date; it is always the last row and counts toward progress.
- Progress = done subtasks ÷ total subtasks, all weighted equally.
- Overdue = the subtask's last day is before today and it isn't done. It shows a red chip outline, and the project card gets a red dot. Overdue subtasks never move on their own.
- A subtask can't end after the publish date. If one is dropped there, prompt to push the publish date instead.
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
- **Database changes are SQL migrations** in `supabase/migrations/`, reviewed in a PR. `npm run test:db` checks the access rules against a local Postgres.
- **Keys:** the app only ever uses the publishable key. The service-role key never goes in the app, the repo or `.env.local`.
- **Configuration:** builds without `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (see `.env.example`) run signed-out only.

## Phone layout (added after the MVP)

Below 768px wide (`PHONE_QUERY` in `src/hooks/useMediaQuery.ts`, Tailwind `max-md:`), the sidebar becomes a Projects tab in a bottom tab bar, cards open as full-screen sheets, and the calendar switches to `PhoneMonth`/`PhoneWeek` in `src/components/calendar/PhoneCalendar.tsx`. Touch drags start with press-and-hold. The desktop layout is unchanged, so check both widths when changing UI. The app is meant to be added to the iPhone Home Screen from Safari.

## Commands

- `npm run dev`: dev server at http://localhost:5173
- `npm run dev:phone`: the same, reachable from a phone on the same Wi-Fi (open the Network address it prints)
- `npm run build`: typecheck, then production build into `dist/`
- `npm run typecheck`: TypeScript only (`tsc -b`)
- `npm test`: Vitest, once; `npm run test:watch` to rerun on save. Tests run in `America/Los_Angeles` so UTC date-parsing bugs fail, and use fake-indexeddb, so data-layer tests need no browser.
- `npm run lint`: Oxlint
- `npm run test:db`: applies `supabase/migrations` to a throwaway local Postgres and runs the access-rule tests (needs a Postgres server, e.g. `brew install postgresql@17`, or `PG_BIN`)
- Pull requests: `.github/workflows/ci.yml` runs the tests, lint and build on every PR. Branch protection on `main` requires that check ("Tests, lint and build") to pass before merging.
- Deploy: push to `main`. `.github/workflows/deploy.yml` runs the tests, lint and build, then publishes `dist/` to https://lhckb.github.io/content-tracker/. The build uses relative asset paths (`base: './'`), so it works under that sub-path.
