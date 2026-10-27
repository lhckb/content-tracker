import type { DateRange, ISODate, Project, Subtask } from '../types'
import { daysBetween } from './dates'
import { shiftRange } from './shift'
import { isPublish, lastDay, normalizeRange } from './subtasks'

// Dragging a chip's body moves it; dragging one of its edges moves only
// that end.
export type DragMode = 'move' | 'resize-start' | 'resize-end'

// The dates a chip gets when the pointer goes from `fromDay` (where it was
// grabbed) to `toDay`. An edge can't pass the other end: it stops there,
// leaving a single day.
export function draggedRange(
  range: DateRange,
  mode: DragMode,
  fromDay: ISODate,
  toDay: ISODate,
): DateRange {
  if (mode === 'move') return shiftRange(range, daysBetween(fromDay, toDay))
  if (mode === 'resize-start') {
    const end = lastDay(range)
    return normalizeRange(toDay < end ? toDay : end, end)
  }
  return normalizeRange(range.start, toDay > range.start ? toDay : range.start)
}

export function sameRange(a: DateRange, b: DateRange): boolean {
  return a.start === b.start && lastDay(a) === lastDay(b)
}

export interface DragPreview {
  subtaskId: string
  range: DateRange
}

// The data as it would look with the dragged subtask on its new dates, so
// the calendar can redraw chips and bands while the drag is in progress.
// Dragging Publish moves its project's publish date with it.
export function applyPreview<T extends { projects: Project[]; subtasks: Subtask[] }>(
  data: T,
  preview: DragPreview | null,
): T {
  const dragged = preview && data.subtasks.find((s) => s.id === preview.subtaskId)
  if (!preview || !dragged) return data
  const { start, end } = preview.range
  return {
    ...data,
    subtasks: data.subtasks.map((s) => (s.id === dragged.id ? { ...s, start, end } : s)),
    projects: isPublish(dragged)
      ? data.projects.map((p) => (p.id === dragged.projectId ? { ...p, publishDate: start } : p))
      : data.projects,
  }
}
