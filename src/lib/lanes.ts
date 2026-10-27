import type { ISODate, Project, Subtask } from '../types'
import { addDaysISO, daysBetween } from './dates'
import { getProjectSpan } from './span'
import { lastDay, sortSubtasks } from './subtasks'

export interface ProjectWithSubtasks {
  project: Project
  subtasks: Subtask[]
}

// Where something sits in one week row, by column (0 = Sunday, 6 = Saturday).
export interface WeekPlacement {
  startCol: number
  endCol: number
  // It carries on from the previous week row, or into the next one.
  continuesBefore: boolean
  continuesAfter: boolean
}

export interface ChipPlacement extends WeekPlacement {
  subtask: Subtask
  // Row within the project's band, so chips that share a day don't overlap.
  row: number
}

export interface BandSegment extends WeekPlacement {
  project: Project
  chips: ChipPlacement[]
  rowCount: number
}

// One horizontal track of a week row. Its segments never share a day.
export interface Lane {
  segments: BandSegment[]
  rowCount: number
}

// Clips the days `start`..`end` to the week starting `weekStart`, or returns
// null when they miss it.
export function placeInWeek(
  weekStart: ISODate,
  start: ISODate,
  end: ISODate,
): WeekPlacement | null {
  const weekEnd = addDaysISO(weekStart, 6)
  if (end < weekStart || start > weekEnd) return null
  return {
    startCol: Math.max(0, daysBetween(weekStart, start)),
    endCol: Math.min(6, daysBetween(weekStart, end)),
    continuesBefore: start < weekStart,
    continuesAfter: end > weekEnd,
  }
}

// Lays out one week row. Every project whose band touches the week gets a
// segment; segments go into the first lane where they don't share a day with
// another, earliest-starting band first, so busy weeks stay compact and a
// project tends to keep its lane from one week to the next.
export function layoutWeek(
  weekStart: ISODate,
  items: readonly ProjectWithSubtasks[],
): Lane[] {
  const bands = items
    .map((item) => ({ ...item, span: getProjectSpan(item.project, item.subtasks) }))
    .sort(
      (a, b) =>
        a.span.start.localeCompare(b.span.start) ||
        a.span.end.localeCompare(b.span.end) ||
        a.project.id.localeCompare(b.project.id),
    )

  const lanes: Lane[] = []
  for (const { project, subtasks, span } of bands) {
    const placement = placeInWeek(weekStart, span.start, span.end)
    if (!placement) continue
    const chips = layoutChips(weekStart, subtasks)
    const segment: BandSegment = {
      ...placement,
      project,
      chips,
      rowCount: Math.max(1, ...chips.map((c) => c.row + 1)),
    }
    let lane = lanes.find((l) => l.segments.every((s) => !overlaps(s, segment)))
    if (!lane) {
      lane = { segments: [], rowCount: 0 }
      lanes.push(lane)
    }
    lane.segments.push(segment)
    lane.rowCount = Math.max(lane.rowCount, segment.rowCount)
  }
  return lanes
}

// Places each subtask in the week on the first row that's free on all its days.
function layoutChips(weekStart: ISODate, subtasks: readonly Subtask[]): ChipPlacement[] {
  const rowEnds: number[] = []
  const chips: ChipPlacement[] = []
  for (const subtask of sortSubtasks(subtasks)) {
    const placement = placeInWeek(weekStart, subtask.start, lastDay(subtask))
    if (!placement) continue
    let row = rowEnds.findIndex((end) => end < placement.startCol)
    if (row === -1) row = rowEnds.length
    rowEnds[row] = placement.endCol
    chips.push({ ...placement, subtask, row })
  }
  return chips
}

// The band segment of `lane` covering column `col`, if any, with the chips
// it has on that day.
export function segmentAt(
  lane: Lane,
  col: number,
): { segment: BandSegment; chips: ChipPlacement[] } | null {
  const segment = lane.segments.find((s) => s.startCol <= col && col <= s.endCol)
  if (!segment) return null
  return { segment, chips: segment.chips.filter((c) => c.startCol <= col && col <= c.endCol) }
}

function overlaps(a: WeekPlacement, b: WeekPlacement): boolean {
  return a.startCol <= b.endCol && b.startCol <= a.endCol
}
