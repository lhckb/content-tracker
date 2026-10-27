import { isPublish, lastDay, normalizeRange } from '../lib/subtasks'
import type { DateRange, ISODate, Project, Subtask } from '../types'
import { db } from './db'
import {
  newSubtask,
  requireProject,
  requireSubtask,
  subtasksOf,
  writePublishDate,
} from './internal'

// Returned instead of saving when a subtask would end after its publish date.
export interface EndsAfterPublish {
  ok: false
  reason: 'ends-after-publish'
  publishDate: ISODate
  // The subtask's last day, which the publish date would have to move to.
  endsOn: ISODate
}

export interface GuardRailOptions {
  // Push the publish date out to the subtask's last day instead of refusing.
  pushPublishDate?: boolean
}

export interface NewSubtask {
  title: string
  start: ISODate
  end?: ISODate
}

export type AddSubtaskResult = { ok: true; id: string } | EndsAfterPublish

export async function addSubtask(
  projectId: string,
  input: NewSubtask,
  options: GuardRailOptions = {},
): Promise<AddSubtaskResult> {
  const range = normalizeRange(input.start, input.end)
  return db.transaction(
    'rw',
    db.projects,
    db.subtasks,
    async (): Promise<AddSubtaskResult> => {
      const project = await requireProject(projectId)
      const refusal = await applyGuardRail(project, range, options)
      if (refusal) return refusal
      const existing = await subtasksOf(projectId).toArray()
      const order = Math.max(-1, ...existing.map((s) => s.order)) + 1
      const subtask = newSubtask(projectId, { title: input.title.trim(), ...range, order })
      await db.subtasks.add(subtask)
      return { ok: true, id: subtask.id }
    },
  )
}

export type MoveSubtaskResult = { ok: true } | EndsAfterPublish

// Changes a task's day or range; an empty or repeated end makes it one day.
// The Publish subtask moves with setPublishDate instead.
export async function moveSubtask(
  id: string,
  dates: DateRange,
  options: GuardRailOptions = {},
): Promise<MoveSubtaskResult> {
  const range = normalizeRange(dates.start, dates.end)
  return db.transaction(
    'rw',
    db.projects,
    db.subtasks,
    async (): Promise<MoveSubtaskResult> => {
      const subtask = await requireSubtask(id)
      if (isPublish(subtask)) {
        throw new Error('Move the Publish subtask with setPublishDate')
      }
      const project = await requireProject(subtask.projectId)
      const refusal = await applyGuardRail(project, range, options)
      if (refusal) return refusal
      // Dexie deletes a property that is set to undefined, which is how a
      // range turns back into a single day.
      await db.subtasks.update(id, { start: range.start, end: range.end })
      return { ok: true }
    },
  )
}

export type SubtaskPatch = Partial<Pick<Subtask, 'title' | 'notes' | 'done'>>

export async function updateSubtask(id: string, patch: SubtaskPatch): Promise<void> {
  await db.transaction('rw', db.subtasks, async () => {
    const subtask = await requireSubtask(id)
    if (patch.title !== undefined && isPublish(subtask)) {
      throw new Error("The Publish subtask can't be renamed")
    }
    await db.subtasks.update(id, patch)
  })
}

export async function deleteSubtask(id: string): Promise<void> {
  await db.transaction('rw', db.subtasks, async () => {
    const subtask = await requireSubtask(id)
    if (isPublish(subtask)) throw new Error("The Publish subtask can't be deleted")
    await db.subtasks.delete(id)
  })
}

// Returns the refusal when `range` ends after the publish date, or moves
// the publish date out if asked to. Null means the change can go ahead.
async function applyGuardRail(
  project: Project,
  range: DateRange,
  options: GuardRailOptions,
): Promise<EndsAfterPublish | null> {
  const endsOn = lastDay(range)
  if (endsOn <= project.publishDate) return null
  if (!options.pushPublishDate) {
    return {
      ok: false,
      reason: 'ends-after-publish',
      publishDate: project.publishDate,
      endsOn,
    }
  }
  await writePublishDate(project.id, endsOn)
  return null
}
