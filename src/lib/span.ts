import type { ISODate, Project, Subtask } from '../types'
import { isCleanup, lastDay } from './subtasks'

export interface Span {
  start: ISODate
  // The later of the publish date and the last clean-up day. The band is
  // lighter after the publish date.
  end: ISODate
  publishDate: ISODate
}

// A project's band on the calendar: from its earliest subtask day to its
// publish date, or on to its last clean-up task, all inclusive.
export function getProjectSpan(
  project: Pick<Project, 'publishDate'>,
  subtasks: readonly Pick<Subtask, 'start' | 'end' | 'kind'>[],
): Span {
  let start = project.publishDate
  let end = project.publishDate
  for (const subtask of subtasks) {
    if (subtask.start < start) start = subtask.start
    if (isCleanup(subtask) && lastDay(subtask) > end) end = lastDay(subtask)
  }
  return { start, end, publishDate: project.publishDate }
}
