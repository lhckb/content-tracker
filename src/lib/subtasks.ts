import type { DateRange, ISODate, Subtask } from '../types'
import { assertISODate } from './dates'

export function lastDay(range: DateRange): ISODate {
  return range.end ?? range.start
}

export function isPublish(subtask: Pick<Subtask, 'kind'>): boolean {
  return subtask.kind === 'publish'
}

export function isCleanup(subtask: Pick<Subtask, 'kind'>): boolean {
  return subtask.kind === 'cleanup'
}

export function includesDay(range: DateRange, day: ISODate): boolean {
  return range.start <= day && day <= lastDay(range)
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

// List order in the project detail: tasks by date, then Publish, then
// clean-up tasks by date. `order` breaks ties between subtasks on the same
// days.
const KIND_ORDER: Record<Subtask['kind'], number> = { task: 0, publish: 1, cleanup: 2 }

export function sortSubtasks(subtasks: readonly Subtask[]): Subtask[] {
  return [...subtasks].sort((a, b) => {
    if (a.kind !== b.kind) return KIND_ORDER[a.kind] - KIND_ORDER[b.kind]
    if (a.start !== b.start) return a.start < b.start ? -1 : 1
    if (lastDay(a) !== lastDay(b)) return lastDay(a) < lastDay(b) ? -1 : 1
    return a.order - b.order
  })
}

export function groupByProject(subtasks: readonly Subtask[]): Map<string, Subtask[]> {
  const groups = new Map<string, Subtask[]>()
  for (const subtask of subtasks) {
    const group = groups.get(subtask.projectId)
    if (group) group.push(subtask)
    else groups.set(subtask.projectId, [subtask])
  }
  return groups
}

// Guard rail: a task can't end after its project's publish date. Clean-up
// tasks are exempt.
export function endsAfter(range: DateRange, publishDate: ISODate): boolean {
  return lastDay(range) > publishDate
}

// The tasks that would break the guard rail if the publish date moved to
// `publishDate`.
export function tasksEndingAfter(
  subtasks: readonly Subtask[],
  publishDate: ISODate,
): Subtask[] {
  return subtasks.filter((s) => s.kind === 'task' && endsAfter(s, publishDate))
}
