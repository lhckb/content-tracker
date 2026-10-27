import { isColorAvailable, pickColor } from '../lib/colors'
import { addDaysISO, assertISODate } from '../lib/dates'
import { shiftRange } from '../lib/shift'
import { sortSubtasks, tasksEndingAfter } from '../lib/subtasks'
import { defaultTasks, PUBLISH_TITLE } from '../lib/template'
import type { ColorId, ISODate, Platform, Project, Subtask } from '../types'
import { db, requestPersistentStorage } from './db'
import {
  activeColors,
  newSubtask,
  requireProject,
  subtasksOf,
  writePublishDate,
} from './internal'

export interface NewProject {
  title: string
  platform: Platform
  publishDate: ISODate
  withDefaultSubtasks: boolean
}

// Returns the new project's id. It always gets a Publish subtask, with or
// without the default ones.
export async function createProject(input: NewProject): Promise<string> {
  assertISODate(input.publishDate)
  // Now there's something worth keeping, ask the browser to hold on to it.
  void requestPersistentStorage()
  return db.transaction('rw', db.projects, db.subtasks, async () => {
    const project: Project = {
      id: crypto.randomUUID(),
      title: input.title.trim(),
      platform: input.platform,
      color: pickColor(await activeColors()),
      publishDate: input.publishDate,
      notes: '',
      archived: false,
    }
    const tasks = input.withDefaultSubtasks ? defaultTasks(input.publishDate) : []
    await db.projects.add(project)
    await db.subtasks.bulkAdd([
      ...tasks.map((task, order) => newSubtask(project.id, { ...task, order })),
      newSubtask(project.id, {
        kind: 'publish',
        title: PUBLISH_TITLE,
        start: input.publishDate,
        order: tasks.length,
      }),
    ])
    return project.id
  })
}

export type ProjectPatch = Partial<Pick<Project, 'title' | 'platform' | 'notes'>>

export async function updateProject(id: string, patch: ProjectPatch): Promise<void> {
  await db.projects.update(id, patch)
}

export type SetColorResult = { ok: true } | { ok: false; reason: 'color-taken' }

// Refuses a color another active project already uses, unless every color
// is taken. Archived projects are gray, so they can take any color.
export async function setProjectColor(id: string, color: ColorId): Promise<SetColorResult> {
  return db.transaction('rw', db.projects, async (): Promise<SetColorResult> => {
    const project = await requireProject(id)
    if (!project.archived && !isColorAvailable(color, await activeColors(id))) {
      return { ok: false, reason: 'color-taken' }
    }
    await db.projects.update(id, { color })
    return { ok: true }
  })
}

export type SetPublishDateResult =
  | { ok: true }
  | { ok: false; reason: 'tasks-after-publish'; tasks: Subtask[] }

// Moves the publish date and its Publish subtask. Other subtasks stay put,
// so the move is refused, naming the tasks in the way, if any of them would
// end after the new date.
export async function setPublishDate(
  projectId: string,
  date: ISODate,
): Promise<SetPublishDateResult> {
  assertISODate(date)
  return db.transaction(
    'rw',
    db.projects,
    db.subtasks,
    async (): Promise<SetPublishDateResult> => {
      await requireProject(projectId)
      const blocking = tasksEndingAfter(await subtasksOf(projectId).toArray(), date)
      if (blocking.length > 0) {
        return { ok: false, reason: 'tasks-after-publish', tasks: sortSubtasks(blocking) }
      }
      await writePublishDate(projectId, date)
      return { ok: true }
    },
  )
}

// Moves every subtask (done ones and Publish included) and the publish date
// by the same number of days.
export async function shiftProject(projectId: string, days: number): Promise<void> {
  if (!Number.isInteger(days)) throw new Error(`Shift must be whole days, got ${days}`)
  await db.transaction('rw', db.projects, db.subtasks, async () => {
    const project = await requireProject(projectId)
    await db.projects.update(projectId, {
      publishDate: addDaysISO(project.publishDate, days),
    })
    await subtasksOf(projectId).modify((subtask) => {
      Object.assign(subtask, shiftRange(subtask, days))
    })
  })
}

export async function archiveProject(id: string): Promise<void> {
  await db.projects.update(id, { archived: true })
}

// Makes an archived project active again. It keeps its color unless an
// active project took it in the meantime, in which case it gets a free one.
export async function restoreProject(id: string): Promise<void> {
  await db.transaction('rw', db.projects, async () => {
    const project = await requireProject(id)
    const taken = await activeColors(id)
    const color = isColorAvailable(project.color, taken) ? project.color : pickColor(taken)
    await db.projects.update(id, { archived: false, color })
  })
}

export async function deleteProject(id: string): Promise<void> {
  await db.transaction('rw', db.projects, db.subtasks, async () => {
    await subtasksOf(id).delete()
    await db.projects.delete(id)
  })
}
