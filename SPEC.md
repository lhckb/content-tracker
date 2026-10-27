# Content Tracker — MVP Spec

Exported Oct 27, 2026 from the Claude doc "Content Tracker — MVP Spec". The doc holds the visual mockups; the layouts are described in words below.

## Overview

The MVP is a personal web app where each video is a project with a publish date and dated subtasks, all shown on one color-coded calendar. It replaces paper planning, which breaks down when several videos are in progress at once.

The MVP is done when you can open the app and see, at a glance, what to work on today across every active project, how far along each one is, and move any task to another day without rewriting anything.

## Data model

Two objects: a Project owns many Subtasks. A project's calendar span is not stored; it runs from its earliest subtask date to its publish date.

**Project**

| Field | Type | Notes |
| --- | --- | --- |
| Title | text | e.g. "Morning routine vlog" |
| Platform | YouTube / Instagram | Shown as a small icon on the card |
| Color | one of ~8 presets | Auto-assigned on create, editable; no two active projects share one |
| Publish date | date | Required; the project's end on the calendar |
| Notes | long text | Free-form: ideas, script, shot list |
| Archived | yes/no | Set when published; grays it out on the calendar and lists it under Archive |

**Subtask**

| Field | Type | Notes |
| --- | --- | --- |
| Title | text | e.g. "Record A-roll" |
| Date | date or range | One day; add an end date to make it a range (e.g. editing Mon–Wed) |
| Done | yes/no | Drives the progress bar |
| Notes | long text | Optional |
| Order | number | Position in the project's subtask list |

**Default template.** A new project starts with Script, A-roll, B-roll, Edit, Thumbnail and Publish, which you can rename, delete or add to. Publish is fixed to the publish date and is the last step toward 100%.

## Screens

Four screens cover the MVP: the calendar (home), the project detail, the subtask card, and a new-project dialog. Everything opens on click and edits in place; there are no separate edit pages.

### 1. Calendar (home)

**Mockup layout (calendar):**

- Top bar: app name on the left, "+ New project" button on the right.
- Left sidebar (~200px): "Active projects" heading, then one card per project: a color bar on the card's left edge, title, "Platform · publish <date>", a progress bar with the percentage, and a red dot when any subtask is overdue. Below the cards, a collapsible "▸ Archive · N projects" row.
- Main area: "‹ November 2026 ›" month navigation, Month/Week toggle on the right. Grid columns Sun–Sat; each week row shows day numbers top-left; today's cell is shaded with a "Today" label.
- Inside each week row, every project gets a lane. A light tint of the project color runs from its first subtask to its publish date and continues across week rows. Each subtask is a stronger-colored chip on its day, stretched across all its days if it's a range. Done chips are faded with "✓"; overdue chips get a red outline; the Publish chip is bold; archived projects' chips are gray.

Each project gets its own color and a tinted band from its first subtask to its publish day; days with a task show a chip naming it, stretched across every day of a multi-day task. Overlapping projects stack in lanes, so a busy week stays readable. The sidebar lists active projects with their progress, with a collapsible Archive list below. Archived projects stay on the calendar, grayed out. A Month/Week toggle switches density.

### 2. Project detail

**Mockup layout (project detail):**

- Header: color dot, editable title, platform pill (YouTube/Instagram), close ✕.
- Row: Publish date picker, color swatches (current one ringed), "Shift project…" button on the right.
- Progress bar across the card with "3 of 6 done · 50%" on the right.
- Two columns. Left, "Subtasks": one row per subtask with a checkbox, title, date or range, and a chevron that opens the subtask card. Done rows are muted, today's row is highlighted, Publish is always the last row ("Nov 14 · publish date"), and a dashed "+ Add subtask" row sits below. Right, "Notes": a large text area with "Saves as you type".
- Footer: "Delete project" in red text on the left, "Archive project" button on the right.

Clicking a project card opens this as a large card over the calendar. Title, publish date, color and notes edit in place; each subtask row ticks off with its checkbox or opens its own card with the arrow. Publish is always the last row and moves with the publish date.

### 3. New project and subtask card

**Mockup layout (dialogs):**

- New project: Title input (placeholder "e.g. Desk setup tour"), Platform segmented control (YouTube / Instagram), Publish date picker, a checked "Start with default subtasks" box listing "Script, A-roll, B-roll, Edit, Thumbnail, Publish", then Cancel and Create buttons.
- Subtask card: the parent project's color dot and name, close ✕; the subtask title large and editable; "Date or range" picker; Status box with a "Mark as done" checkbox; Notes text area; "Delete" in red text and a "Back to project" button.

New project asks only for a title, platform and publish date, with the default subtasks ticked on. The subtask card holds a single date or a start–end range, a done toggle and notes; changing its date here moves its chip on the calendar.

## Progress tracking

Progress = done subtasks ÷ total subtasks, every subtask weighted equally, shown as a bar plus "4 of 6 · 67%". Publish counts as a subtask, so a project only hits 100% once the video is out.

A subtask whose date has passed and isn't done is marked overdue (red outline on the calendar, red dot in the list). Ticking Publish offers to archive the project, which grays its band on the calendar and moves its card to the Archive list, where it can be reopened or restored.

## Rescheduling

Any date can be changed two ways: drag on the calendar, or edit the date field in a card. The project band redraws itself after every change.

- **Move one subtask:** drag its chip to another day, or change its dates in the subtask card. A multi-day subtask moves as a whole; drag either edge of its chip to change its start or end.
- **Move the publish date:** drag the Publish chip or edit it in the project detail. Other subtasks stay put.
- **Shift a whole project:** a "Shift project" action in the detail view moves every subtask and the publish date by the same number of days.
- **Guard rail:** a subtask can't end after its publish date. Dropping it there shows a prompt to push the publish date instead.

## Out of scope for MVP

These are deliberately left for later so the first version ships quickly:

- Connecting to the Instagram or YouTube APIs (auto-publishing, analytics, pulling published videos)
- Collaborators, sharing, or multiple user accounts
- Reminders and notifications
- File attachments (thumbnails, scripts, raw footage)
- Time-of-day scheduling; everything is by day
- Recurring projects (e.g. a weekly Reel series)

**First post-MVP item: cloud sync with login.** Every read and write goes through one data layer, so a cloud backend can be added later without touching the screens.

## Technical decisions

Data stays in this browser for the MVP, the app is desktop-first, and the stack below is a proposal since you had no preference.

| Area | Choice | Why |
| --- | --- | --- |
| Storage | This browser only, no login | Nothing to host or sign into; cloud sync is the first post-MVP item |
| Device | Desktop-first | A drag-and-drop month grid needs width and a mouse; phone layout isn't designed for MVP |
| Framework | React + TypeScript, built with Vite | Runs as a plain static site; types catch date and data-model bugs early |
| Local database | Dexie (a thin layer over the browser's IndexedDB) | Survives reloads, handles long notes, simple queries by project and date |
| Calendar grid | Custom-built, dates handled with date-fns | Off-the-shelf calendars show events, not a project band with daily chips inside it |
| Drag and drop | dnd-kit | Lets both single chips and whole project bands be dragged |
| Styling | Tailwind CSS | Quick to match the mockups without building a design system |

## Product decisions

Every open question is settled; these are the product rules to build against.

| Topic | Decision |
| --- | --- |
| Subtask dates | One day, or a start–end range |
| Platforms | One platform per project |
| Overdue subtasks | Stay on their day, marked red |
| Calendar views | Month and week |
| New-project template | Default subtasks ticked on; you set every date |
| Backup | Export/import all projects to one file |
| Week start | Sunday |
| Archived projects | Grayed out on the calendar; listed in a sidebar Archive where they can be reopened or restored |
