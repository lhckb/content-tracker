import type { DateRange, ISODate, Subtask } from '../types'
import { assertISODate } from './dates'

export function lastDay(range: DateRange): ISODate {
  return range.end ?? range.start
}

export function isPublish(subtask: Pick<Subtask, 'kind'>): boolean {
  return subtask.kind === 'publish'
}

// Validates a start/end pair and drops an end that is empty or equal to the
// start, so a one-day subtask is always stored without one.
export function normalizeRange(start: ISODate, end?: ISODate): DateRange {
  assertISODate(start)
  if (!end || end === start) return { start }
  assertISODate(end)
  if (end < start) {
    throw new Error(`A range can't end (${end}) before it starts (${start})`)
  }
  return { start, end }
}

// List order in the project detail: by date, Publish always last, and
// `order` breaks ties between subtasks on the same days.
export function sortSubtasks(subtasks: readonly Subtask[]): Subtask[] {
  return [...subtasks].sort((a, b) => {
    if (isPublish(a) !== isPublish(b)) return isPublish(a) ? 1 : -1
    if (a.start !== b.start) return a.start < b.start ? -1 : 1
    if (lastDay(a) !== lastDay(b)) return lastDay(a) < lastDay(b) ? -1 : 1
    return a.order - b.order
  })
}

// Guard rail: a subtask can't end after its project's publish date.
export function endsAfter(range: DateRange, publishDate: ISODate): boolean {
  return lastDay(range) > publishDate
}

// The tasks that would break the guard rail if the publish date moved to
// `publishDate`.
export function tasksEndingAfter(
  subtasks: readonly Subtask[],
  publishDate: ISODate,
): Subtask[] {
  return subtasks.filter((s) => !isPublish(s) && endsAfter(s, publishDate))
}
