# Plan: Clean-up tasks

Status: built; waiting for the migration on dev and production · 2026-10-28. You chose the recommended option for questions A–D and kept the defaults under E–K. The checks so far are T-18 to T-21 in `docs/testing/manual-tests.md`.

## Goal

Some work comes after a video is out, such as backing up the raw footage or sharing the video on Instagram Stories. Clean-up tasks are subtasks for that work. They belong to a project and sit on the calendar like any subtask, with three differences:

- **They don't count toward progress.** A project still reaches 100% when Publish is ticked.
- **Ticking Publish doesn't tick them.** It still ticks every other subtask, as it does today.
- **They may fall after the publish date.** The guard rail doesn't apply to them.

A published project with clean-up tasks still open stays active, under **Wrapping up** in the sidebar. You're offered to archive it once the last one is done.

## Screens

### Calendar (month, week, phone)

- **Chips:** a clean-up chip looks like any task chip in the project's color, with a small broom icon before its title (decision E). In the week view and the phone day lists, its second line reads "Clean-up". Done chips fade with "✓", and overdue chips get the red outline, as for tasks (decision C).
- **The band:** the tint still runs from the first subtask to Publish. After Publish, a lighter tint, about half as strong, carries it on to the last clean-up task (decision A). Lanes reserve room for this lighter part too, so it never overlaps another project.
- **Drag and drop:** clean-up chips move and resize like task chips. Because the guard rail doesn't apply, dropping one after Publish never asks to push the publish date.
- **Archived projects:** the whole band turns gray as today, the lighter part and clean-up chips included.

### Project detail

- **Subtasks:** the list is unchanged, and Publish is still its last row. The progress bar and "3 of 6 done · 50%" leave clean-up tasks out.
- **A Clean-up section below it,** headed "Clean-up · 1 of 2 done":
  - one row per clean-up task, the same as a subtask row (checkbox, title, date or range, chevron);
  - a dashed "+ Add clean-up task" row; a new task starts on the day after publish (decision F).
- **Publish date and Shift project:**
  - moving the publish date leaves clean-up tasks where they are, and they never block the move;
  - Shift project moves them along with everything else.
- **Archive project:** if clean-up tasks are still open, the button asks first: "2 clean-up tasks aren't done. Archive anyway?" (decision G).

### Subtask card

A **Clean-up task** checkbox under Status, with "Doesn't count toward progress" beneath it (decision H):

- ticking it moves the task to the Clean-up section;
- unticking it moves the task back to Subtasks. If the task ends after the publish date, the usual prompt offers to push the publish date, and declining cancels;
- Publish has no such box.

### New project dialog

A second box, **Start with default clean-up tasks**, ticked on, listing "Back up raw footage, Share on Instagram Stories" (decision D). Both tasks start on the day after publish. Make project from an idea uses the same dialog, so it gets the box too.

### Ticking Publish, and archiving

1. **Ticking Publish** ticks every task except clean-up tasks.
   - If no clean-up task is open, the archive offer appears as today.
   - If some are open, there's no offer. A notice reads "Published · 2 clean-up tasks left", and the project moves to Wrapping up (decision B).
2. **Ticking the last open clean-up task** of a published project offers to archive it: '"Morning routine vlog" is published and its clean-up is done. Archive the project?'
3. **Unticking Publish** leaves the other tasks as they are, as today, and the project goes back to Active projects.

### Sidebar and the phone's Projects tab

- **A Wrapping up group** sits between Active projects and the Archive row. It holds every project whose Publish is ticked but that isn't archived yet (decision I).
- **Its cards:**
  - the color bar, the title, and "YouTube · published Nov 14";
  - instead of the progress bar, "Clean-up · 1 of 3 done", or "Ready to archive" when nothing is left;
  - the red dot when a clean-up task is overdue.
- **Color:** a project keeps its color while it's wrapping up, because it's still active (decision J).

## Data

### On the device

```ts
export type SubtaskKind = 'task' | 'publish' | 'cleanup'
```

- **No Dexie version bump.** `kind` isn't indexed, and existing rows are all `'task'` or `'publish'`.
- **Pure logic,** with tests:
  - `src/lib/subtasks.ts` gains `isCleanup`.
    - `tasksEndingAfter` and `endsAfter` callers skip clean-up tasks.
    - `sortSubtasks` puts tasks by date, then Publish, then clean-up tasks by date.
  - `getProgress` counts only tasks and Publish.
  - `getProjectSpan` returns `publishDate` alongside `end`, which becomes the later of the publish date and the last clean-up day. Lanes use the whole span, and the band draws its lighter part from `publishDate` to `end`.
  - `hasOverdue` and `isOverdue` are unchanged, so clean-up tasks count.
  - A new `src/lib/cleanup.ts` has `isWrappingUp(project, subtasks)` (Publish done and not archived) and `cleanupProgress(subtasks)`.
  - `src/lib/template.ts` gains `DEFAULT_CLEANUP_TITLES` and `defaultCleanupTasks(publishDate)`.
- **Data functions** (`src/data/`):
  - `addSubtask` takes `kind?: 'task' | 'cleanup'`, and the guard rail doesn't apply to clean-up tasks. `moveSubtask` skips the guard rail for them too.
  - `updateSubtask`: ticking Publish ticks only `kind === 'task'` rows.
  - `setPublishDate` isn't blocked by clean-up tasks.
  - A new `setCleanup(id, cleanup, options)` turns a task into a clean-up task and back. Turning one back applies the guard rail and returns the usual `EndsAfterPublish` refusal.
  - `createProject` takes `withDefaultCleanup`.
  - `setDone` in `src/components/actions.ts` makes the archive offer as described above.
- **Backup:**
  - Format version 3, since a file with clean-up tasks would look damaged to an older app. Versions 1 and 2 still import.
- **Sample data (dev only):** one project wrapping up, with an overdue clean-up task.

### On the server

A new migration, `supabase/migrations/<timestamp>_cleanup_subtasks.sql`, widens the check on `subtasks.kind` to allow `'cleanup'`. Postgres names the existing check `subtasks_kind_check`, but confirm the name before dropping it.

- **Compatible with the live app:** the old app never writes `'cleanup'`. `sync_push` needs no change, because `kind` is already plain text.
- **The four locks are untouched:** row-level security, `is_allowed()`, nothing for anyone signed out, no deletes.
- **Tests:** `npm run test:db` checks that a `'cleanup'` row is accepted and an unknown kind is refused.

## What doesn't change

Ideas, the color rules, how regular tasks and Publish drag, the guard rail for regular tasks, and Shift project. The only difference for Shift project is that clean-up tasks move with it.

CLAUDE.md does change: two of its "easy to get wrong" rules (progress, and the guard rail) gain "except clean-up tasks", and a new "Clean-up tasks" section points here.

## Steps

Start after the Ideas PR is merged, since this builds on backup format 2 and the shared New project dialog. One branch (`cleanup-tasks`), one PR, and one commit per step. You merge.

1. **Database:** the migration and its access tests. You run it in the dev project's SQL Editor.
2. **Logic and data layer:**
   - the kind, the pure logic and the data functions above;
   - backup format 3 and the sample data;
   - unit tests, including:
     - a clean-up round trip through sync against the fake server;
     - ticking Publish not ticking clean-up tasks;
     - progress leaving them out;
     - the guard rail and the publish date ignoring them.
3. **Calendar:**
   - the lighter band past Publish, the broom icon, and chips in the month, week and phone views;
   - checked in the browser at desktop and phone widths.
4. **Panels and sidebar:**
   - the Clean-up section, the subtask card box, the New project box, the archive flow, and Wrapping up in the sidebar and the Projects tab;
   - checked in the browser at both widths, plus a two-browser sync check against dev.
5. **Wrap-up:**
   - CLAUDE.md;
   - you run the migration in production **before** merging;
   - I check production from outside;
   - you merge.

Every browser and API check is logged in `docs/testing/manual-tests.md`.

**Only you can do:** run the migration, in dev after step 1 and in production before the merge.

**No new dependencies.** The broom icon is inline SVG, like the platform icons.

## Risks

- **The migration order.** Until production has the migration, sync from the new app fails on the first clean-up task. The order in step 5 avoids that.
- **Old tabs, and the Home Screen app, on other devices.** The old version reads `kind` without checking it, so it treats a clean-up task as a regular one. There, clean-up tasks count toward progress and block publish-date moves. Ticking Publish there would also tick them, and that would sync. Reload every device after the deploy.
- **Colors.** Wrapping-up projects hold one of the 8 colors until they're archived. If several are wrapping up at once, colors start repeating sooner.

## Decisions

**A. Do clean-up tasks have dates and show on the calendar?**
- *(Recommended)* Yes. They're dated like any subtask, usually after publish, and a lighter tint carries the band on from Publish to the last one.
- Dated, but only shown in the project detail.
- No dates: a checklist in the project detail.

A: dated, on the calendar, with the lighter tint after Publish.

**B. Ticking Publish while clean-up tasks are open?**
- *(Recommended)* No archive offer yet. The project stays active under Wrapping up, and ticking the last clean-up task offers to archive.
- Archive offer as today, with the archived project's clean-up tasks staying live in color.
- Archive offer as today, with everything gray.

A: wait to archive, with a Wrapping up group.

**C. Do overdue clean-up tasks turn red?**
- *(Recommended)* Yes: a red outline on the chip and a red dot on the card.
- No, never.

A: yes, like other tasks.

**D. Default clean-up tasks for new projects?**
- *(Recommended)* "Back up raw footage" and "Share on Instagram Stories", with the box ticked on.
- The same list, with the box ticked off.
- None.

A: the two defaults, ticked on.

**Defaults I chose (change any before work starts):**

- **E.** A broom icon on clean-up chips, plus "Clean-up" on their second line in the week view and phone lists.
- **F.** A new clean-up task starts on the day after publish.
- **G.** Archive project asks first when clean-up tasks are open. Once archived, the clean-up tasks are gray like the rest.
- **H.** A task can switch between regular and clean-up in the subtask card. Switching back to regular applies the guard rail.
- **I.** Wrapping up holds every published, unarchived project, including one with no clean-up tasks whose archive offer you turned down. Today that project would stay in Active projects at 100%.
- **J.** Wrapping-up projects keep their color.
- **K.** Clean-up tasks can sit on any day, before the publish date too, e.g. backing up footage right after the shoot.
