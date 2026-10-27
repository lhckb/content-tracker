import { useDraggable } from '@dnd-kit/core'
import { Fragment, useMemo } from 'react'
import { dayOfMonth, daysOfWeek, isSameMonth } from '../../lib/calendar'
import { projectHex, tint } from '../../lib/colors'
import { daysBetween, formatDateRange } from '../../lib/dates'
import type { DragMode } from '../../lib/drag'
import {
  layoutWeek,
  type ChipPlacement,
  type Lane,
  type ProjectWithSubtasks,
  type WeekPlacement,
} from '../../lib/lanes'
import { isOverdue } from '../../lib/overdue'
import { isPublish } from '../../lib/subtasks'
import type { ISODate, Project } from '../../types'
import { cx } from '../cx'
import type { ChipDragData } from './useChipDrag'

// One Sunday-to-Saturday row: day cells behind, project lanes on top.
export function WeekRow({
  weekStart,
  month,
  today,
  items,
  liftedId,
  onOpenProject,
  onOpenSubtask,
}: {
  weekStart: ISODate
  month: ISODate
  today: ISODate
  items: ProjectWithSubtasks[]
  // The subtask being dragged, drawn raised.
  liftedId: string | null
} & Openers) {
  const lanes = useMemo(() => layoutWeek(weekStart, items), [weekStart, items])

  return (
    <div className="relative min-h-28 border-b border-stone-200 last:border-b-0">
      <div className="absolute inset-0 grid grid-cols-7">
        {daysOfWeek(weekStart).map((day, i) => {
          const isToday = day === today
          const inMonth = isSameMonth(day, month)
          return (
            <div
              key={day}
              // Drop target lookup: see dayAt in useChipDrag.
              data-day={day}
              className={cx(
                'px-2 py-1 text-xs',
                i > 0 && 'border-l border-stone-200',
                isToday ? 'bg-stone-100' : !inMonth && 'bg-stone-50',
                inMonth ? 'text-stone-600' : 'text-stone-400',
              )}
            >
              <span className={cx(isToday && 'font-semibold text-stone-900')}>
                {dayOfMonth(day)}
              </span>
              {isToday && <span className="ml-1.5 font-semibold text-stone-900">Today</span>}
            </div>
          )
        })}
      </div>

      <div className="relative flex flex-col gap-1 pt-7 pb-2">
        {lanes.map((lane, i) => (
          <LaneRow
            key={i}
            lane={lane}
            weekStart={weekStart}
            today={today}
            liftedId={liftedId}
            onOpenProject={onOpenProject}
            onOpenSubtask={onOpenSubtask}
          />
        ))}
      </div>
    </div>
  )
}

// What clicking does: a chip opens its subtask, the band its project.
export interface Openers {
  onOpenProject: (projectId: string) => void
  onOpenSubtask: (subtaskId: string) => void
}

function LaneRow({
  lane,
  weekStart,
  today,
  liftedId,
  onOpenProject,
  onOpenSubtask,
}: { lane: Lane; weekStart: ISODate; today: ISODate; liftedId: string | null } & Openers) {
  return (
    <div
      className="grid grid-cols-7 gap-y-0.5"
      style={{ gridTemplateRows: `repeat(${lane.rowCount}, 1.5rem)` }}
    >
      {lane.segments.map((segment) => (
        <Fragment key={segment.project.id}>
          <div
            title={`Open ${segment.project.title}`}
            onClick={() => onOpenProject(segment.project.id)}
            className={cx(edges(segment, 'band'), 'cursor-pointer')}
            style={{
              gridColumn: columns(segment),
              gridRow: '1 / -1',
              background: tint(projectHex(segment.project), 16, 'transparent'),
            }}
          />
          {segment.chips.map((chip) => (
            <Chip
              key={chip.subtask.id}
              chip={chip}
              project={segment.project}
              weekStart={weekStart}
              today={today}
              lifted={chip.subtask.id === liftedId}
              onOpen={() => onOpenSubtask(chip.subtask.id)}
            />
          ))}
        </Fragment>
      ))}
    </div>
  )
}

function Chip({
  chip,
  project,
  weekStart,
  today,
  lifted,
  onOpen,
}: {
  chip: ChipPlacement
  project: Project
  weekStart: ISODate
  today: ISODate
  lifted: boolean
  onOpen: () => void
}) {
  const { subtask } = chip
  // Archived projects stay put; Publish moves but is always one day.
  const movable = !project.archived
  const resizable = movable && !isPublish(subtask)
  // A range crossing into the next week is drawn once per week row, so the
  // ids include the week to stay unique.
  const { setNodeRef, listeners } = useDraggable({
    id: `move:${subtask.id}:${weekStart}`,
    data: { subtaskId: subtask.id, mode: 'move' } satisfies ChipDragData,
    disabled: !movable,
  })

  const hex = projectHex(project)
  const overdue = !project.archived && isOverdue(subtask, today)
  const days = subtask.end ? daysBetween(subtask.start, subtask.end) + 1 : 1
  const label = `${subtask.title}${days > 1 ? ` · ${days} days` : ''}${subtask.done ? ' ✓' : ''}`
  const detail = `${project.title}: ${subtask.title}, ${formatDateRange(subtask.start, subtask.end)}${
    subtask.done ? ', done' : overdue ? ', overdue' : ''
  }`

  return (
    <button
      ref={setNodeRef}
      {...listeners}
      type="button"
      title={detail}
      aria-label={detail}
      onClick={onOpen}
      className={cx(
        edges(chip, 'chip'),
        'relative flex min-w-0 items-center border px-1.5 text-left text-xs text-stone-800 hover:brightness-95',
        subtask.kind === 'publish' && 'font-semibold',
        subtask.done && 'opacity-50',
        overdue && 'border-red-600 ring-1 ring-red-600',
        lifted && 'z-10 shadow-md ring-2 ring-stone-800/40',
      )}
      style={{
        gridColumn: columns(chip),
        gridRow: chip.row + 1,
        background: tint(hex, 35),
        borderColor: overdue ? undefined : hex,
      }}
    >
      {resizable && !chip.continuesBefore && (
        <ResizeHandle subtaskId={subtask.id} weekStart={weekStart} mode="resize-start" />
      )}
      <span className="truncate">{label}</span>
      {resizable && !chip.continuesAfter && (
        <ResizeHandle subtaskId={subtask.id} weekStart={weekStart} mode="resize-end" />
      )}
    </button>
  )
}

// A strip along one end of a chip that drags just that end. It sits inside
// the chip, and dnd-kit lets the innermost draggable claim the press.
function ResizeHandle({
  subtaskId,
  weekStart,
  mode,
}: {
  subtaskId: string
  weekStart: ISODate
  mode: Exclude<DragMode, 'move'>
}) {
  const { setNodeRef, listeners } = useDraggable({
    id: `${mode}:${subtaskId}:${weekStart}`,
    data: { subtaskId, mode } satisfies ChipDragData,
  })
  return (
    <span
      ref={setNodeRef}
      {...listeners}
      aria-hidden="true"
      className={cx(
        'absolute inset-y-0 w-2 cursor-ew-resize hover:bg-stone-900/15',
        mode === 'resize-start' ? 'left-0 rounded-l' : 'right-0 rounded-r',
      )}
    />
  )
}

function columns(placement: WeekPlacement): string {
  return `${placement.startCol + 1} / ${placement.endCol + 2}`
}

// Written out in full so Tailwind's source scan finds every class.
const EDGE_CLASSES = {
  band: { start: 'ml-0.5 rounded-l-md', end: 'mr-0.5 rounded-r-md' },
  chip: { start: 'ml-1 rounded-l', end: 'mr-1 rounded-r' },
}

// Inset and rounded at its own ends; flush and square where it carries on
// into the neighbouring week row.
function edges(placement: WeekPlacement, kind: keyof typeof EDGE_CLASSES): string {
  return cx(
    !placement.continuesBefore && EDGE_CLASSES[kind].start,
    !placement.continuesAfter && EDGE_CLASSES[kind].end,
  )
}
