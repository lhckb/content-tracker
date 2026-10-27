import {
  addSubtask,
  archiveProject,
  moveSubtask,
  setPublishDate,
  updateSubtask,
  type NewSubtask,
} from '../data'
import { formatShortDate } from '../lib/dates'
import { isPublish } from '../lib/subtasks'
import type { DateRange, ISODate, Project, Subtask } from '../types'

// The steps that need to ask the person something, shared by the cards and
// (later) the calendar's drag and drop.

// Moves a task, offering to push the publish date out if the new dates end
// after it. Resolves false when the person declines and nothing changed.
export async function moveTask(task: Subtask, dates: DateRange): Promise<boolean> {
  const result = await moveSubtask(task.id, dates)
  if (result.ok) return true
  if (!confirmPush(task.title, result.endsOn, result.publishDate)) return false
  return (await moveSubtask(task.id, dates, { pushPublishDate: true })).ok
}

export async function addTask(projectId: string, input: NewSubtask): Promise<boolean> {
  const result = await addSubtask(projectId, input)
  if (result.ok) return true
  if (!confirmPush(input.title.trim(), result.endsOn, result.publishDate)) return false
  return (await addSubtask(projectId, input, { pushPublishDate: true })).ok
}

// Moves the publish date. Returns null when done, or a sentence naming the
// tasks that would end after the new date.
export async function movePublishDate(projectId: string, date: ISODate): Promise<string | null> {
  const result = await setPublishDate(projectId, date)
  if (result.ok) return null
  const count = result.tasks.length
  return `${listTitles(result.tasks.map((t) => t.title))} ${count === 1 ? 'ends' : 'end'} after ${formatShortDate(date)}. Move ${count === 1 ? 'it' : 'them'} first, or shift the whole project.`
}

// Ticks a subtask on or off. Ticking Publish offers to archive the project;
// resolves true if it was archived.
export async function setDone(subtask: Subtask, project: Project, done: boolean): Promise<boolean> {
  await updateSubtask(subtask.id, { done })
  if (!done || !isPublish(subtask) || project.archived) return false
  if (!confirm(`"${project.title}" is published. Archive the project?`)) return false
  await archiveProject(project.id)
  return true
}

function confirmPush(title: string, endsOn: ISODate, publishDate: ISODate): boolean {
  return confirm(
    `"${title}" would end on ${formatShortDate(endsOn)}, after the publish date (${formatShortDate(publishDate)}).\n\nPush the publish date to ${formatShortDate(endsOn)}?`,
  )
}

// 'Edit', 'Edit and Thumbnail', 'Script, Edit and Thumbnail'
function listTitles(titles: string[]): string {
  if (titles.length <= 1) return titles.join('')
  return `${titles.slice(0, -1).join(', ')} and ${titles[titles.length - 1]}`
}
