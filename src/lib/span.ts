import type { ISODate, Project, Subtask } from '../types'

export interface Span {
  start: ISODate
  end: ISODate
}

// A project's band on the calendar: from its earliest subtask day to its
// publish date, both inclusive.
export function getProjectSpan(
  project: Pick<Project, 'publishDate'>,
  subtasks: readonly Pick<Subtask, 'start'>[],
): Span {
  let start = project.publishDate
  for (const subtask of subtasks) {
    if (subtask.start < start) start = subtask.start
  }
  return { start, end: project.publishDate }
}
