# Plan: Welcome guide

Status: planned · 2026-10-28. You chose the recommended option for questions A–E. The defaults under F–M are mine; change any before work starts.

## Goal

A short guide that teaches the app at a glance: six cards in a modal, each with a picture of the real app and two or three sentences. It opens by itself on someone's first visit and from the ⋯ menu at any time. Its last card offers a sandbox of sample projects to play with, which is the quickest way to learn by doing.

## Screens

### The guide

- **On the desktop:** a large card, like the project detail. The picture fills the top at 16:10 in a light frame, with the card's title and text below it. The footer has dots for the six cards on the left (each one jumps to its card), and **Back** and **Next** on the right. **Next** becomes **Done** on the last card. ✕ in the corner closes it, as does Escape. ← and → move between cards (decision L).
- **On the phone:** a full-screen sheet, like the other cards. The picture is cropped to the part of the screen that matters, at about 4:5, rather than the whole tall screen (decision J). The buttons sit at the bottom, in reach of a thumb. A swipe moves between cards (decision L).
- **Text carries the meaning.** Every picture has a description for screen readers, and the card reads fine without it.

### The six cards

Each card has a desktop and a phone version of its picture. Where the text differs at phone width, the phone version is given below the desktop one.

1. **Each video is a project.** Picture: the New project dialog.
   - "Press **+ New project** and give it a title, a platform and a publish date. It starts with Script, A-roll, B-roll, Edit, Thumbnail and Publish. Set a date for each, and rename, remove or add steps as you go."
   - Phone: "Tap **+**" in place of "Press **+ New project**".
2. **Every project on one calendar.** Picture: the month with the sidebar; on the phone, the month and a day's tasks.
   - "Each project gets its own color. Its band runs from its first task to its publish date, with a chip on each task's day. Today is shaded. A red outline means a task is overdue, and its project's card gets a red dot."
   - Phone: "Each project gets its own color, and its band runs from its first task to its publish date. Tap a day to see its tasks below the month. A red outline means a task is overdue, and its project gets a red dot."
3. **Move things by dragging.** Picture: a short looping recording.
   - "Drag a chip to another day, or drag either edge to make a task shorter or longer. Dragging Publish moves the publish date. To move a whole project, open it and choose **Shift project…**"
   - Phone: "Press and hold a task until it lifts, then drag it to another day. Dragging Publish moves the publish date. To change how long a task runs, or to shift a whole project, open it."
4. **Tick tasks off.** Picture: a project open, showing its progress bar, its subtasks and its Clean-up section.
   - "Tick a task when it's done, and the project's bar fills up. Ticking Publish means the video is out. Clean-up tasks, with the broom, are for the work after that and don't count toward progress. Once everything's done, archive the project: it turns gray and waits in the Archive, where you can reopen it."
5. **Save ideas for later.** Picture: the Ideas area.
   - "Not ready to plan a video yet? Switch to **Ideas** at the top and jot it down. When it's time, **Make project** turns the idea into a project."
   - Phone: "open the **Ideas** tab" in place of "Switch to **Ideas** at the top".
6. **Your projects, on your devices.** Picture: the ⋯ menu open.
   - Signed out: "Your projects are saved in this browser. Sign in to keep them on all your devices, or export a backup now and then from the ⋯ menu."
   - Signed in: "You're signed in, so your projects stay in step on all your devices."
   - A build without sign-in: "Your projects are saved in this browser only. Export a backup now and then from the ⋯ menu."
   - Buttons: **Try it with sample projects** (only when signed out and not already trying them) and **Done**.

### When it opens

- **By itself** when all of these hold (decision I):
  - this browser hasn't seen the guide;
  - nobody is signed in;
  - there are no projects and no ideas;
  - the sample projects aren't open.
- **Seen** is remembered in this browser once the guide is closed, in any way, like the remembered tab. So it shows once per device, and never to you on a device you already use.
- **From the menu:** **How it works** at the top of the ⋯ menu opens it at the first card.

### Sample projects

- **A sandbox (decision F).** **Try it with sample projects** opens a separate, throwaway set of projects and ideas. It's the dev-only sample data, placed around today, so done, overdue, multi-day, clean-up, wrapping-up and archived tasks all show. These samples never mix with your own projects, are never offered to an account at sign-in, and never sync.
- **A bar under the top bar** while they're open: "You're trying sample projects. Nothing you change here is kept." with a **Done trying** button. That deletes them and returns to your own projects, which are untouched.
- **They stay open across a reload** until **Done trying** (decision G), so the iPhone closing the Home Screen app in the background doesn't throw you out.
- **While trying (decision H):** the sign-in button and Export and Import backup are hidden, and the guide doesn't open by itself.

## Data

- **A third space.** `Space` in `src/data/db.ts` gains `{ kind: 'sample' }`, with its own Dexie database (`content-tracker-sample`). It has no change recording, and sync never runs in it.
  - `trySampleProjects()` deletes any old sample database, switches to the sample space and loads the samples.
  - `stopTryingSamples()` switches back to the guest space and deletes the sample database.
  - `useTryingSamples()` tells screens whether it's open.
  - A flag in this browser keeps the sample space open across a reload. Signing in, in this tab or another, clears it and deletes the sample database.
  - All of these are exported from `src/data/index.ts`, as usual.
- **The sample data ships now.** `loadSampleData` moves from `src/dev/` into `src/data/`, unchanged. The dev menu's **Load sample data** and **Clear all data** stay as they are.
- **Pure logic:** `src/lib/guide.ts` has `shouldOpenGuide({ seen, account, projects, ideas, tryingSamples })`, with tests.
- **Nothing on the server,** no migration, and no new backup format. The sample space isn't backed up, and "seen" isn't data.

### The pictures

- **Where they live:** in `src/assets/guide/`, imported by the guide, so Vite gives them hashed names, and a picture taken again never shows an old cached copy.
- **Formats:**
  - stills are WebP, made with `cwebp`;
  - recordings are silent H.264 MP4s that loop (`autoplay muted loop playsinline`), with a still frame as the poster, made with `ffmpeg`. They play on the iPhone, Home Screen app included.
- **Sizes:**
  - about 10 stills at 50–120 KB each, plus 2 recordings at about 300–700 KB each, so 1.5–2.5 MB in all;
  - the app itself is about 740 KB, so only the open card's picture loads, plus the next card's, so **Next** is instant. Nothing loads at startup.
- **Reduce Motion:** with Reduce Motion on, a recording doesn't play by itself. It shows its poster with a play button (decision K).
- **Desktop or phone:** the guide picks the set with `PHONE_QUERY`, like the calendar.
- **How they're made:** a section at the end of this plan, written as they're taken, says how to take them again. That covers the window sizes, the sample projects and the commands.

## Shot list for the recordings (you)

Record these after step 2, from the dev server with **Try it with sample projects** open. Aim for 6–10 seconds each, with a short pause between actions so the loop reads well. Don't worry about trimming or cropping; I'll do that.

1. **Desktop, Move things.**
   - Chrome at about 1280×800, Month view.
   - With ⌘⇧5, choose **Record Selected Portion** around the calendar. Under **Options**, turn on **Show Mouse Clicks**.
   - Drag a single-day chip, e.g. Thumbnail, two days later. Pause.
   - Drag the right edge of a range, e.g. Edit, out one more day. Pause.
   - Stop.
2. **Phone, Move things.**
   - On the iPhone, with `npm run dev:phone`, Calendar tab, Month.
   - Start a Screen Recording from Control Center.
   - Tap a day with a task. Press and hold the task in the list until it lifts, drag it onto another day in the month, and let go. Pause.
   - Stop.
   - The iPhone doesn't show touches, but the task lifting makes the gesture clear.

Send me the file paths when they're done.

## What doesn't change

The calendar, the panels, sync, the four locks, backups and the dev menu. The top bar only gains the sample bar, and the ⋯ menu gains **How it works**.

## Steps

One branch (`welcome-guide`), one PR, and one commit per step. You merge.

1. **Sample projects space:**
   - the space, the three functions and the flag across reloads;
   - the sample data moved into `src/data/`;
   - unit tests, including:
     - the samples landing in their own database while the guest one stays untouched;
     - the guest copy offer never seeing them;
     - **Done trying** deleting them;
     - a reload while trying staying in the samples;
     - signing in clearing them.
2. **The guide:**
   - the modal and the six cards, with gray placeholder frames where the pictures go;
   - the navigation, the first-visit rule, **How it works** in the menu, and the sample bar;
   - checked in the browser at desktop and phone widths.
3. **Stills:**
   - I take the 10 stills in Chrome from the dev server with the sample projects, at desktop (1280×800) and phone (390×844) sizes, crop and compress them, and put them in place;
   - meanwhile you record the two clips.
4. **Recordings:**
   - I trim, crop and compress your clips, add the posters and the Reduce Motion handling;
   - checked on the desktop, and on the iPhone by you.
5. **Wrap-up:**
   - a "Welcome guide" section in CLAUDE.md, including retaking the pictures when the UI they show changes;
   - push and open the PR. You merge.

Every browser check is logged in `docs/testing/manual-tests.md`, from T-25.

**Only you can do:** record the two clips, and try the guide on the iPhone.

**No new dependencies.** `ffmpeg` and `cwebp` are already installed on the Mac and are only used to make the files, not by the app.

## Risks

- **Pictures go stale.** The UI changes often, and every change to a screen the guide shows can leave a picture behind. The steps for retaking them, and the note in CLAUDE.md, keep that a routine job.
- **Repo weight.** About 2 MB of pictures goes into git, and each retake adds more history.
- **Autoplay on the iPhone.** Videos only play by themselves muted and inline, and Low Power Mode can stop them. The poster and the play button cover that.
- **Switching spaces.** The sample space adds a third place the app can be. The tests in step 1 cover the switches, sign-in in particular, so samples can never reach an account.

## Decisions

**A. What kind of pictures?**
- *(Recommended)* Screenshots, plus short recordings for the dragging card, as a desktop set and a phone set.
- Screenshots only.
- Live mini-demos drawn by the app.

A: screenshots, plus recordings for dragging.

**B. Who records the clips?**

A: you, from the shot list above.

**C. When does the guide open?**
- *(Recommended)* By itself on the first visit, and from the ⋯ menu.
- Only from the menu.

A: the first visit, and the menu.

**D. Which cards?**

A: the six above, for now.

**E. A "Try it with sample projects" button?**

A: yes.

**Defaults I chose (change any before work starts):**

- **F.** The samples are a separate sandbox, not mixed into your projects. Because they can't mix, they're offered whenever nobody's signed in, not only when the app is empty.
- **G.** Trying the samples lasts across a reload, until **Done trying**.
- **H.** While trying the samples, sign-in and Export and Import backup are hidden.
- **I.** The guide opens by itself only signed out with an empty app, once per browser.
- **J.** Phone pictures are cropped to the part that matters, not the whole screen.
- **K.** With Reduce Motion on, recordings wait for a tap on play.
- **L.** A swipe on the phone, and the arrow keys on the desktop, move between cards.
- **M.** The card text as drafted above. Edit it freely: it's the heart of the guide.
