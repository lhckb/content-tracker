import { useDraggable } from '@dnd-kit/core'
import { Fragment, useMemo, type ReactNode } from 'react'
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
import type { ISODate, Project, Subtask } from '../../types'
import { cx } from '../cx'
import type { ChipDragData } from './useChipDrag'

// Month packs a whole month of short chips; week gives one week room for
// full titles, the project name and a done checkbox on each chip.
export type CalendarMode = 'month' | 'week'

// What clicking does: a chip opens its subtask, the band its project.
export interface CalendarActions {
  onOpenProject: (projectId: string) => void
  onOpenSubtask: (subtaskId: string) => void
  onToggleDone: (subtask: Subtask, project: Project, done: boolean) => void
}

// One Sunday-to-Saturday row: day cells behind, project lanes on top.
export function WeekRow({
  mode,
  weekStart,
  month,
  today,
  items,
  liftedId,
  actions,
}: {
  mode: CalendarMode
  weekStart: ISODate
  // The month on screen, whose days are drawn brighter. Null in week view.
  month: ISODate | null
  today: ISODate
  items: ProjectWithSubtasks[]
  // The subtask being dragged, drawn raised.
  liftedId: string | null
  actions: CalendarActions
}) {
  const lanes = useMemo(() => layoutWeek(weekStart, items), [weekStart, items])

  return (
    <div
      className={cx(
        'relative border-b border-stone-200 last:border-b-0',
        mode === 'month' ? 'min-h-28' : 'min-h-[32rem]',
      )}
    >
      <div className="absolute inset-0 grid grid-cols-7">
        {daysOfWeek(weekStart).map((day, i) => {
          const isToday = day === today
          const dimmed = month !== null && !isSameMonth(day, month)
          return (
            <div
              key={day}
              // Drop target lookup: see dayAt in useChipDrag.
              data-day={day}
              className={cx(
                'px-2 py-1 text-xs',
                i > 0 && 'border-l border-stone-200',
                isToday ? 'bg-stone-100' : dimmed && 'bg-stone-50',
                dimmed ? 'text-stone-400' : 'text-stone-600',
              )}
            >
              {/* Week view names its days in the header row instead. */}
              {mode === 'month' && (
                <>
                  <span className={cx(isToday && 'font-semibold text-stone-900')}>
                    {dayOfMonth(day)}
                  </span>
                  {isToday && <span className="ml-1.5 font-semibold text-stone-900">Today</span>}
                </>
              )}
            </div>
          )
        })}
      </div>

      <div className={cx('relative flex flex-col pb-2', mode === 'month' ? 'gap-1 pt-7' : 'gap-2 pt-2')}>
        {lanes.map((lane, i) => (
          <LaneRow
            key={i}
            mode={mode}
            lane={lane}
            weekStart={weekStart}
            today={today}
            liftedId={liftedId}
            actions={actions}
          />
        ))}
      </div>
    </div>
  )
}

function LaneRow({
  mode,
  lane,
  weekStart,
  today,
  liftedId,
  actions,
}: {
  mode: CalendarMode
  lane: Lane
  weekStart: ISODate
  today: ISODate
  liftedId: string | null
  actions: CalendarActions
}) {
  return (
    <div
      className="grid grid-cols-7 gap-y-0.5"
      style={{
        gridTemplateRows:
          mode === 'month'
            ? `repeat(${lane.rowCount}, 1.5rem)`
            : `repeat(${lane.rowCount}, minmax(2.75rem, auto))`,
      }}
    >
      {lane.segments.map((segment) => (
        <Fragment key={segment.project.id}>
          <div
            title={`Open ${segment.project.title}`}
            onClick={() => actions.onOpenProject(segment.project.id)}
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
              mode={mode}
              chip={chip}
              project={segment.project}
              weekStart={weekStart}
              today={today}
              lifted={chip.subtask.id === liftedId}
              actions={actions}
            />
          ))}
        </Fragment>
      ))}
    </div>
  )
}

function Chip({
  mode,
  chip,
  project,
  weekStart,
  today,
  lifted,
  actions,
}: {
  mode: CalendarMode
  chip: ChipPlacement
  project: Project
  weekStart: ISODate
  today: ISODate
  lifted: boolean
  actions: CalendarActions
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
  const length = days > 1 ? ` · ${days} days` : ''
  const detail = `${project.title}: ${subtask.title}, ${formatDateRange(subtask.start, subtask.end)}${
    subtask.done ? ', done' : overdue ? ', overdue' : ''
  }`
  const open = () => actions.onOpenSubtask(subtask.id)

  const handles = (content: ReactNode) => (
    <>
      {resizable && !chip.continuesBefore && (
        <ResizeHandle subtaskId={subtask.id} weekStart={weekStart} mode="resize-start" />
      )}
      {content}
      {resizable && !chip.continuesAfter && (
        <ResizeHandle subtaskId={subtask.id} weekStart={weekStart} mode="resize-end" />
      )}
    </>
  )

  const shared = {
    ref: setNodeRef,
    ...listeners,
    className: cx(
      edges(chip, 'chip'),
      'relative flex min-w-0 border text-left text-xs text-stone-800',
      subtask.kind === 'publish' && 'font-semibold',
      overdue && 'border-red-600 ring-1 ring-red-600',
      lifted && 'z-10 shadow-md ring-2 ring-stone-800/40',
    ),
    style: {
      gridColumn: columns(chip),
      gridRow: chip.row + 1,
      background: tint(hex, 35),
      borderColor: overdue ? undefined : hex,
    },
  }

  if (mode === 'month') {
    return (
      <button
        {...shared}
        type="button"
        title={detail}
        aria-label={detail}
        onClick={open}
        className={cx(shared.className, 'items-center px-1.5 hover:brightness-95', subtask.done && 'opacity-50')}
      >
        {handles(<span className="truncate">{`${subtask.title}${length}${subtask.done ? ' ✓' : ''}`}</span>)}
      </button>
    )
  }

  // Week view: a checkbox and a button side by side, since a checkbox can't
  // sit inside a button. The chip itself is the drag handle.
  return (
    <div {...shared} className={cx(shared.className, 'items-start gap-1.5 px-2 py-1.5')}>
      {handles(
        <>
          <input
            type="checkbox"
            aria-label={`${subtask.title} done`}
            checked={subtask.done}
            onChange={(event) => actions.onToggleDone(subtask, project, event.target.checked)}
            // Pressing the checkbox shouldn't start a drag.
            onPointerDown={(event) => event.stopPropagation()}
            className="mt-0.5 size-3.5 shrink-0"
          />
          <button
            type="button"
            title={detail}
            aria-label={detail}
            onClick={open}
            className={cx('min-w-0 flex-1 text-left', subtask.done && 'opacity-50')}
          >
            <span className={cx('block leading-snug', subtask.done && 'line-through')}>
              {subtask.title}
            </span>
            {/* "Overdue" first, so a narrow column cuts the project name instead. */}
            <span className="block truncate text-[11px] font-normal text-stone-600">
              {overdue && <span className="font-medium text-red-700">Overdue · </span>}
              {project.title}
              {length}
            </span>
          </button>
        </>,
      )}
    </div>
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
        'absolute inset-y-0 z-10 w-2 cursor-ew-resize hover:bg-stone-900/15',
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
