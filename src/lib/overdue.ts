import type { ISODate, Project, Subtask } from '../types'
import { lastDay } from './subtasks'

// Overdue subtasks stay on their day; they are only ever flagged, never moved.
export function isOverdue(
  subtask: Pick<Subtask, 'start' | 'end' | 'done'>,
  today: ISODate,
): boolean {
  return !subtask.done && lastDay(subtask) < today
}

// Archived projects are drawn all gray, so they never show as overdue.
export function hasOverdue(
  project: Pick<Project, 'archived'>,
  subtasks: readonly Subtask[],
  today: ISODate,
): boolean {
  return !project.archived && subtasks.some((s) => isOverdue(s, today))
}
