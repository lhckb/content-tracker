import {
  addSubtask,
  archiveProject,
  getSubtasks,
  moveSubtask,
  setCleanup,
  setPublishDate,
  updateSubtask,
  type NewSubtask,
} from '../data'
import { formatShortDate } from '../lib/dates'
import { plural } from '../lib/plural'
import { isCleanup, isPublish } from '../lib/subtasks'
import type { DateRange, ISODate, Project, Subtask } from '../types'
import { ask } from './ask'

// The steps that need to ask the person something, shared by the cards and
// the calendar's drag and drop.

// Moves a task, offering to push the publish date out if the new dates end
// after it. Resolves false when the person declines and nothing changed.
export async function moveTask(task: Subtask, dates: DateRange): Promise<boolean> {
  const result = await moveSubtask(task.id, dates)
  if (result.ok) return true
  if (!(await confirmPush(task.title, result.endsOn, result.publishDate))) return false
  return (await moveSubtask(task.id, dates, { pushPublishDate: true })).ok
}

export async function addTask(projectId: string, input: NewSubtask): Promise<boolean> {
  const result = await addSubtask(projectId, input)
  if (result.ok) return true
  if (!(await confirmPush(input.title.trim(), result.endsOn, result.publishDate))) return false
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

// Turns a task into a clean-up task or back, offering to push the publish
// date out if a task turned back ends after it. Resolves false when the
// person declines and nothing changed.
export async function setCleanupKind(task: Subtask, cleanup: boolean): Promise<boolean> {
  const result = await setCleanup(task.id, cleanup)
  if (result.ok) return true
  if (!(await confirmPush(task.title, result.endsOn, result.publishDate))) return false
  return (await setCleanup(task.id, cleanup, { pushPublishDate: true })).ok
}

export interface DoneResult {
  archived: boolean
  // What to tell the person, if anything.
  notice: string | null
}

const NOTHING: DoneResult = { archived: false, notice: null }

// Ticks a subtask on or off. Ticking Publish also ticks the other tasks (see
// updateSubtask) and offers to archive the project, unless clean-up tasks
// are still open; then ticking the last of those makes the offer.
export async function setDone(subtask: Subtask, project: Project, done: boolean): Promise<DoneResult> {
  await updateSubtask(subtask.id, { done })
  if (!done || project.archived || subtask.kind === 'task') return NOTHING
  const subtasks = await getSubtasks(project.id)
  const openCleanup = subtasks.filter((s) => isCleanup(s) && !s.done).length
  let question: string
  if (isPublish(subtask)) {
    if (openCleanup > 0) {
      return { archived: false, notice: `Published · ${plural(openCleanup, 'clean-up task')} left` }
    }
    question = `"${project.title}" is published and all its subtasks are done. Archive the project?`
  } else {
    const published = subtasks.some((s) => isPublish(s) && s.done)
    if (!published || openCleanup > 0) return NOTHING
    question = `"${project.title}" is published and its clean-up is done. Archive the project?`
  }
  if (!(await ask(question, { confirmLabel: 'Archive' }))) return NOTHING
  await archiveProject(project.id)
  return { archived: true, notice: `Archived "${project.title}".` }
}

function confirmPush(title: string, endsOn: ISODate, publishDate: ISODate): Promise<boolean> {
  return ask(
    `"${title}" would end on ${formatShortDate(endsOn)}, after the publish date (${formatShortDate(publishDate)}).\n\nPush the publish date to ${formatShortDate(endsOn)}?`,
    { confirmLabel: 'Push publish date' },
  )
}

// 'Edit', 'Edit and Thumbnail', 'Script, Edit and Thumbnail'
function listTitles(titles: string[]): string {
  if (titles.length <= 1) return titles.join('')
  return `${titles.slice(0, -1).join(', ')} and ${titles[titles.length - 1]}`
}
