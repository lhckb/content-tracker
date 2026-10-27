import type { ISODate, Project, Subtask } from '../types'
import type { ProjectWithSubtasks } from './lanes'
import { includesDay, sortSubtasks } from './subtasks'

export interface DayTask {
  subtask: Subtask
  project: Project
}

// What's on each of `days`: every subtask whose day or range covers it, for
// the phone layout's day lists. Projects publishing soonest come first, and
// each project's subtasks keep their list order.
export function tasksOnDays(
  items: readonly ProjectWithSubtasks[],
  days: readonly ISODate[],
): Map<ISODate, DayTask[]> {
  const ordered = [...items].sort(
    (a, b) =>
      a.project.publishDate.localeCompare(b.project.publishDate) ||
      a.project.id.localeCompare(b.project.id),
  )
  const byDay = new Map<ISODate, DayTask[]>(days.map((day) => [day, []]))
  for (const { project, subtasks } of ordered) {
    for (const subtask of sortSubtasks(subtasks)) {
      for (const day of days) {
        if (includesDay(subtask, day)) byDay.get(day)?.push({ subtask, project })
      }
    }
  }
  return byDay
}
