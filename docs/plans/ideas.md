# Plan: Ideas

Status: built and in review · 2026-10-28. The migration has run on dev and production; the checks are T-13 to T-17 in `docs/testing/manual-tests.md`. You accepted every recommendation (decisions at the end).

## Goal

A place to drop video ideas, kept apart from the calendar. Each idea has a platform (YouTube or Instagram), a title, a description and, optionally, a month to work on it. When an idea is ready, one button turns it into an active project with its subtasks, and it leaves the Ideas list.

Ideas never show on the calendar, in the project list or in any progress, and they don't take one of the 8 project colors. A project only gets a color when it's made from an idea.

## Screens

### Getting there

- **Phone:** a third tab in the bottom bar, **Calendar · Projects · Ideas**, with a light-bulb icon.
- **Desktop:** a **Calendar | Ideas** switch in the top bar, next to the app name (decision A). Ideas takes the whole area below the top bar, sidebar included, since the sidebar lists projects. The browser remembers the choice, as it does Month/Week.

### The Ideas area

- **Two columns, YouTube and Instagram,** each headed by its icon and a count ("YouTube · 7"). On the phone, a YouTube | Instagram switch at the top shows one column at a time.
- **Adding** (decision E): an "Add an idea…" field at the top of each column. Type a title and press Enter. The idea is added and the field is ready for the next one.
- **Cards, grouped by month** (decisions C and D):
  - month headings, soonest first ("November 2026", "December 2026"…), then "No month";
  - the newest first within each group;
  - months that have passed stay at the top, under a heading marked "past", with no red.
- **Each card:** the title, the first three lines of the description, and a **Make project** button.
- **When empty:** "No YouTube ideas yet."

### The idea card

It opens on click: a small card on desktop, like the subtask card, and a full-screen sheet on the phone. Everything edits in place.

- **Title,** large and editable.
- **Platform:** YouTube / Instagram. Switching moves the idea to the other column.
- **Month:**
  - Two dropdowns, Month and Year, plus "No month". It isn't the browser's own month picker, because Safari and Firefox on the Mac don't have one.
  - Years run from this year to three years ahead, plus the idea's own year if it's outside that range.
- **Description:** a large text area that saves as you type, like a project's Notes.
- **Footer:** **Delete idea** in red text (it asks first) and a **Make project** button.

### Make project

1. It opens the usual **New project** dialog, filled in from the idea: the title, the platform, and "Start with default subtasks" ticked.
2. **You pick the publish date,** which is required, as for any project (decision B). It starts empty. If the idea has a month, the dialog shows "Planned for March 2027" under the date.
3. **Create does it all as one change:**
   - the project is created, with the next free color, its default subtasks and Publish;
   - the idea's description becomes the project's Notes;
   - the idea is removed from Ideas.

   The project detail then opens, as it does after any new project. Because it's a single change, sync can never end up with both the idea and the project, or with neither.
4. **Cancel** changes nothing, and the idea stays.

## Data

### On the device

```ts
interface Idea {
  id: string
  title: string
  platform: Platform
  description: string
  // The month to work on it, 'YYYY-MM'. Absent when not set.
  month?: string
  // When it was added, for ordering within a month.
  createdAt: string
}
```

- **Storage:**
  - A new `ideas` table in every space's database (Dexie version 4).
  - Ideas are written through `writing()`, and the change recording covers them, so they sync like projects. `PendingChange.table` gains `'ideas'`.
- **Data functions:** in `src/data/ideas.ts`:
  - `addIdea`, `updateIdea`, `deleteIdea`, and `makeProjectFromIdea`, which wraps the project creation and the idea's removal in one `writing()`;
  - a `useIdeas()` hook, separate from `useTrackerData()`, so editing an idea doesn't redraw the calendar.
- **Pure logic:** grouping and ordering live in `src/lib/ideas.ts`, with tests.

### On the server

A new migration, `supabase/migrations/20261028120000_ideas.sql`:

- **The `ideas` table:**
  - columns: `id`, `user_id`, `platform`, `title`, `description`, `month` (text, checked to be `YYYY-MM`), `created_at`, `deleted`, `edited_at`, `updated_at`;
  - the same `updated_at` trigger as the other tables.
- **The same four locks:**
  - row-level security, so each user sees only their own rows, plus `is_allowed()`;
  - nothing for anyone signed out;
  - no delete permission, since deletes are tombstones as for projects.
- **`sync_push`** gains a third list, `idea_rows`, which defaults to empty. A device still running the old app keeps syncing projects until it reloads.
- **Realtime** announces idea changes too.
- **Tests:** `npm run test:db` gains the same access checks for `ideas`.

### Also updated

- **Backup:**
  - Format version 2 adds the ideas.
  - Version 1 files still import. They replace the projects and leave your ideas alone, since they never contained any.
- **Signing in on a device with signed-out data:** the offer counts ideas too ("2 projects and 3 ideas made while signed out") and copies both.
- **Clear all data (dev only):** it clears the ideas too.
- **Sample data (dev only):** it loads a few ideas too.

## What doesn't change

The calendar, the sidebar, progress, colors, drag and drop and the project detail. The top bar's **+ New project** stays as it is in both areas.

## Steps

One branch (`ideas`), one PR, and a commit per step. You merge.

1. **Database:** the migration and its access tests. You run it in the dev project's SQL Editor.
2. **Data layer:**
   - ideas storage and the data functions;
   - sync (push, pull, live updates);
   - the backup format, the signed-out copy and the sample data.

   Unit tests, including sync against the fake server.
3. **The Ideas area:**
   - the area itself, the idea card, and Make project;
   - checked in the browser at desktop and phone widths, plus two-browser sync against the dev project;
   - logged in `docs/testing/manual-tests.md`.
4. **Wrap-up:**
   - CLAUDE.md gains an "Ideas" section;
   - you run the migration in production **before** merging (the new app needs it, and the old one works with it);
   - I check production from outside;
   - you merge.

**Only you can do:** run the migration, in dev after step 1 and in production before the merge.

**No new dependencies.**

## Risks

- **The migration order.** If the new app went live before production had the migration, sync would fail with an error until it did. The order in step 4 avoids that.
- **Old tabs on other devices.** They keep syncing projects, and ideas appear there once the tab reloads with the new version.

## Decisions

You accepted the recommended option for every question.

**A. Desktop: where does Ideas live?**
- *(Recommended)* A "Calendar | Ideas" switch in the top bar, with Ideas taking the whole area below it.
- An "Ideas" button that opens a large card over the calendar, like the project detail.

A: the Calendar | Ideas switch in the top bar.

**B. Making a project from an idea that has a month: what should the publish date start as?**
- *(Recommended)* Empty, with "Planned for March 2027" shown under it, so you always pick the day.
- The last day of that month, ready to change.

A: empty, with the planned month shown under it.

**C. Order within each column?**
- *(Recommended)* Grouped under month headings, soonest first, then "No month", with the newest first within each group.
- Newest first with no grouping, and the month shown on each card.
- Your own order, by dragging.

A: grouped under month headings, soonest first, then "No month", with the newest first within each group.

**D. Ideas whose month has passed, e.g. one planned for September 2026, seen in November?**
- *(Recommended)* They stay at the top, under a heading marked "past", with no red, since red means overdue tasks.
- Nothing special: just their month heading.

A: under a heading marked "past" at the top, with no red.

**E. Adding an idea?**
- *(Recommended)* A quick "Add an idea…" field at the top of each column: type a title and press Enter, then open the card for the description and month.
- A "+ Add idea" button that opens an empty idea card each time.

A: the quick "Add an idea…" field at the top of each column.
