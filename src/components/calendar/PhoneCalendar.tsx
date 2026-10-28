import { useDraggable } from '@dnd-kit/core'
import { Fragment, useMemo, useState } from 'react'
import { tasksOnDays, type DayTask } from '../../lib/agenda'
import {
  dayOfMonth,
  daysOfWeek,
  isSameMonth,
  WEEKDAY_LABELS,
  weeksOfMonth,
} from '../../lib/calendar'
import { OVERDUE_HEX, projectHex, tint } from '../../lib/colors'
import { formatDateRange, formatLongDate, formatShortDate } from '../../lib/dates'
import {
  layoutWeek,
  segmentAt,
  type Lane,
  type ProjectWithSubtasks,
  type WeekPlacement,
} from '../../lib/lanes'
import { isOverdue } from '../../lib/overdue'
import { isCleanup, isPublish } from '../../lib/subtasks'
import type { ISODate, Project, Subtask } from '../../types'
import { CleanupIcon } from '../CleanupIcon'
import { cx } from '../cx'
import { stopDragStart, type ChipDragData } from './useChipDrag'
import type { CalendarActions } from './WeekRow'

// The calendar at phone width, where seven columns are too narrow for named
// chips. Each project still shows as a band from its first task to its
// publish date, solid on the days it has a task: thin lanes across the
// month grid, with the chosen day's tasks listed below, and lines down the
// side of the week's list of days. Every day area carries data-day, so
// press-and-hold dragging can drop a task on it (see useChipDrag).

interface PhoneCalendarProps {
  items: ProjectWithSubtasks[]
  today: ISODate
  // The days a dragged task would land on, highlighted.
  targetDays: ReadonlySet<ISODate>
  draggingId: string | null
  actions: CalendarActions
}

export function PhoneMonth({
  month,
  items,
  today,
  targetDays,
  draggingId,
  actions,
}: PhoneCalendarProps & { month: ISODate }) {
  const firstChoice = (m: ISODate) => (isSameMonth(today, m) ? today : m)
  const [selected, setSelected] = useState(() => firstChoice(month))
  // Moving to another month selects today there, or else its first day.
  const [shownMonth, setShownMonth] = useState(month)
  if (month !== shownMonth) {
    setShownMonth(month)
    setSelected(firstChoice(month))
  }

  const days = useMemo(() => weeksOfMonth(month).flatMap(daysOfWeek), [month])
  const byDay = useMemo(() => tasksOnDays(items, days), [items, days])
  const selectedTasks = byDay.get(selected) ?? []

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
        <div className="grid grid-cols-7 border-b border-stone-200 text-center text-[11px] font-medium text-stone-500">
          {WEEKDAY_LABELS.map((label) => (
            <div key={label} className="py-1.5">
              {label[0]}
            </div>
          ))}
        </div>
        {weeksOfMonth(month).map((weekStart) => (
          <MonthWeekRow
            key={weekStart}
            weekStart={weekStart}
            month={month}
            items={items}
            taskCount={(day) => byDay.get(day)?.length ?? 0}
            selected={selected}
            today={today}
            targetDays={targetDays}
            onSelect={setSelected}
          />
        ))}
      </div>

      <section
        aria-label={`Tasks on ${formatLongDate(selected)}`}
        data-day={selected}
        className="flex flex-col gap-2"
      >
        <h3 className="px-1 text-sm font-semibold">
          {formatLongDate(selected)}
          {selected === today && ' · Today'}
        </h3>
        <TaskList
          tasks={selectedTasks}
          day={selected}
          empty="Nothing planned."
          today={today}
          draggingId={draggingId}
          actions={actions}
        />
      </section>
    </div>
  )
}

export function PhoneWeek({
  week,
  items,
  today,
  targetDays,
  draggingId,
  actions,
}: PhoneCalendarProps & { week: ISODate }) {
  const days = useMemo(() => daysOfWeek(week), [week])
  const byDay = useMemo(() => tasksOnDays(items, days), [items, days])
  const lanes = useMemo(() => layoutWeek(week, items), [week, items])

  // One card with the days as rows, so each project's line runs unbroken
  // down the left from its first task to its publish date.
  return (
    <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
      {days.map((day, i) => (
        <section
          key={day}
          data-day={day}
          aria-label={formatLongDate(day)}
          className={cx(
            'flex',
            targetDays.has(day) ? 'bg-blue-50 ring-2 ring-blue-500 ring-inset' : day === today && 'bg-stone-50',
          )}
        >
          {lanes.length > 0 && (
            <div aria-hidden="true" className="flex shrink-0 gap-1 pl-2.5">
              {lanes.map((lane, l) => (
                <DayLine key={l} lane={lane} col={i} today={today} />
              ))}
            </div>
          )}
          <div className={cx('min-w-0 flex-1 p-2', i > 0 && 'border-t border-stone-100')}>
            <h3 className={cx('px-1 pb-1.5 text-sm', day === today ? 'font-semibold' : 'text-stone-600')}>
              {WEEKDAY_LABELS[i]} {formatShortDate(day)}
              {day === today && ' · Today'}
            </h3>
            <TaskList
              tasks={byDay.get(day) ?? []}
              day={day}
              empty="Nothing planned"
              today={today}
              draggingId={draggingId}
              actions={actions}
            />
          </div>
        </section>
      ))}
    </div>
  )
}

// One week of the month grid: day cells to tap behind, and over them a thin
// lane per project band (the same layout as the desktop grid, without text).
function MonthWeekRow({
  weekStart,
  month,
  items,
  taskCount,
  selected,
  today,
  targetDays,
  onSelect,
}: {
  weekStart: ISODate
  month: ISODate
  items: ProjectWithSubtasks[]
  taskCount: (day: ISODate) => number
  selected: ISODate
  today: ISODate
  targetDays: ReadonlySet<ISODate>
  onSelect: (day: ISODate) => void
}) {
  const lanes = useMemo(() => layoutWeek(weekStart, items), [weekStart, items])

  return (
    <div className="relative min-h-16 border-t border-stone-100 first:border-t-0">
      <div className="absolute inset-0 grid grid-cols-7">
        {daysOfWeek(weekStart).map((day, i) => {
          const count = taskCount(day)
          const inMonth = isSameMonth(day, month)
          return (
            <button
              key={day}
              type="button"
              data-day={day}
              aria-pressed={day === selected}
              aria-label={`${formatLongDate(day)}, ${count} ${count === 1 ? 'task' : 'tasks'}`}
              onClick={() => onSelect(day)}
              className={cx(
                'flex touch-manipulation justify-center pt-1',
                i > 0 && 'border-l border-stone-100',
                targetDays.has(day) ? 'bg-blue-100' : !inMonth && 'bg-stone-50',
                day === selected && 'ring-2 ring-stone-800 ring-inset',
              )}
            >
              <span
                className={cx(
                  'grid size-6 place-items-center rounded-full text-xs',
                  day === today ? 'bg-stone-900 font-semibold text-white' : !inMonth && 'text-stone-400',
                )}
              >
                {dayOfMonth(day)}
              </span>
            </button>
          )
        })}
      </div>
      {/* Taps pass through the lanes to the day underneath. */}
      <div aria-hidden="true" className="pointer-events-none relative flex flex-col gap-1 pt-8 pb-2">
        {lanes.map((lane, i) => (
          <MiniLane key={i} lane={lane} today={today} />
        ))}
      </div>
    </div>
  )
}

// A lane of the month grid: the project's tinted band (lighter after the
// publish date), with a solid stretch on each task's days.
function MiniLane({ lane, today }: { lane: Lane; today: ISODate }) {
  return (
    <div className="grid h-1.5 grid-cols-7">
      {lane.segments.map((segment) => (
        <Fragment key={segment.project.id}>
          {([
            [segment.main, BAND_TINT],
            [segment.tail, TAIL_TINT],
          ] as const).map(
            ([part, strength]) =>
              part && (
                <span
                  key={strength}
                  className={edges(part, 'band')}
                  style={{
                    gridColumn: columns(part),
                    gridRow: 1,
                    background: tint(projectHex(segment.project), strength, 'transparent'),
                  }}
                />
              ),
          )}
          {segment.chips.map((chip) => (
            <span
              key={chip.subtask.id}
              className={cx(edges(chip, 'task'), chip.subtask.done && 'opacity-40')}
              style={{
                gridColumn: columns(chip),
                gridRow: 1,
                background: taskColor(chip.subtask, segment.project, today),
              }}
            />
          ))}
        </Fragment>
      ))}
    </div>
  )
}

// One lane's piece of the line beside a day in the week list: the project's
// band, solid if it has a task that day. Ends are rounded where the band or
// task starts or stops on this day.
function DayLine({ lane, col, today }: { lane: Lane; col: number; today: ISODate }) {
  const here = segmentAt(lane, col)
  if (!here) return <span className="w-1.5" />
  const { segment, chips } = here
  const open = chips.filter((c) => !c.subtask.done)
  // A task still to do decides the color; if they're all done, it fades.
  const shown = open[0] ?? chips[0]
  const bandStarts = segment.startCol === col && !segment.continuesBefore
  const bandEnds = segment.endCol === col && !segment.continuesAfter
  const taskStarts = chips.some((c) => c.startCol === col && !c.continuesBefore)
  const taskEnds = chips.some((c) => c.endCol === col && !c.continuesAfter)
  const inTail = segment.tail !== null && segment.tail.startCol <= col && col <= segment.tail.endCol

  return (
    <span className="relative w-1.5">
      <span
        className={cx(
          'absolute inset-x-0',
          bandStarts ? 'top-2 rounded-t-full' : 'top-0',
          bandEnds ? 'bottom-2 rounded-b-full' : 'bottom-0',
        )}
        style={{ background: tint(projectHex(segment.project), inTail ? TAIL_TINT : BAND_TINT, 'transparent') }}
      />
      {shown && (
        <span
          className={cx(
            'absolute inset-x-0',
            taskStarts ? 'top-2 rounded-t-full' : 'top-0',
            taskEnds ? 'bottom-2 rounded-b-full' : 'bottom-0',
            open.length === 0 && 'opacity-40',
          )}
          style={{ background: taskColor(shown.subtask, segment.project, today) }}
        />
      )}
    </span>
  )
}

// The band's tint, and its lighter part after the publish date.
const BAND_TINT = 30
const TAIL_TINT = 15

function taskColor(subtask: Subtask, project: Project, today: ISODate): string {
  return !project.archived && isOverdue(subtask, today) ? OVERDUE_HEX : projectHex(project)
}

function columns(placement: WeekPlacement): string {
  return `${placement.startCol + 1} / ${placement.endCol + 2}`
}

// Written out in full so Tailwind's source scan finds every class. Tasks are
// inset a little so tasks on consecutive days stay apart.
const EDGE_CLASSES = {
  band: { start: 'rounded-l-full', end: 'rounded-r-full' },
  task: { start: 'ml-0.5 rounded-l-full', end: 'mr-0.5 rounded-r-full' },
}

// Rounded at its own ends; square where it carries on into the next week row.
function edges(placement: WeekPlacement, kind: keyof typeof EDGE_CLASSES): string {
  return cx(
    !placement.continuesBefore && EDGE_CLASSES[kind].start,
    !placement.continuesAfter && EDGE_CLASSES[kind].end,
  )
}

function TaskList({
  tasks,
  day,
  empty,
  today,
  draggingId,
  actions,
}: Pick<PhoneCalendarProps, 'today' | 'draggingId' | 'actions'> & {
  tasks: DayTask[]
  day: ISODate
  empty: string
}) {
  if (tasks.length === 0) return <p className="px-1 pb-1 text-xs text-stone-400">{empty}</p>
  return (
    <ul className="flex flex-col gap-1.5">
      {tasks.map((task) => (
        <li key={task.subtask.id}>
          <PhoneChip
            task={task}
            day={day}
            today={today}
            dragging={task.subtask.id === draggingId}
            actions={actions}
          />
        </li>
      ))}
    </ul>
  )
}

function PhoneChip({
  task,
  day,
  today,
  dragging,
  actions,
}: {
  task: DayTask
  day: ISODate
  today: ISODate
  dragging: boolean
  actions: CalendarActions
}) {
  const { subtask, project } = task
  // A range shows on each of its days, so ids include the day to stay unique.
  const { setNodeRef, listeners } = useDraggable({
    id: `move:${subtask.id}:${day}`,
    data: { subtaskId: subtask.id, mode: 'move' } satisfies ChipDragData,
    disabled: project.archived,
  })
  const overdue = !project.archived && isOverdue(subtask, today)

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      className={cx(
        'flex touch-manipulation items-center gap-3 rounded-lg border bg-white py-1.5 pr-2 pl-3 select-none [-webkit-touch-callout:none]',
        overdue ? 'border-red-600 ring-1 ring-red-600' : 'border-stone-200',
        // The finger carries a copy (see PhoneChipPreview); this one waits.
        dragging && 'opacity-40',
      )}
      style={{ borderLeftWidth: 4, borderLeftColor: projectHex(project) }}
    >
      <input
        type="checkbox"
        aria-label={`${subtask.title} done`}
        checked={subtask.done}
        onChange={(event) => actions.onToggleDone(subtask, project, event.target.checked)}
        {...stopDragStart}
        className="size-5 shrink-0"
      />
      <button
        type="button"
        aria-label={`${project.title}: ${subtask.title}${isCleanup(subtask) ? ', clean-up' : ''}, ${formatDateRange(subtask.start, subtask.end)}${
          subtask.done ? ', done' : overdue ? ', overdue' : ''
        }`}
        onClick={() => actions.onOpenSubtask(subtask.id)}
        className="min-h-11 min-w-0 flex-1 text-left"
      >
        <ChipText task={task} overdue={overdue} />
      </button>
    </div>
  )
}

// The copy that follows the finger while a task is dragged.
export function PhoneChipPreview({ task }: { task: DayTask }) {
  return (
    <div
      className="flex items-center gap-3 rounded-lg border border-stone-300 bg-white py-2 pr-2 pl-3 shadow-xl"
      style={{ borderLeftWidth: 4, borderLeftColor: projectHex(task.project) }}
    >
      <span className="size-5 shrink-0" />
      <span className="min-w-0 flex-1">
        <ChipText task={task} overdue={false} />
      </span>
    </div>
  )
}

function ChipText({ task: { subtask, project }, overdue }: { task: DayTask; overdue: boolean }) {
  return (
    <>
      <span
        className={cx(
          'block text-sm leading-snug',
          isPublish(subtask) && 'font-semibold',
          subtask.done && 'text-stone-400 line-through',
        )}
      >
        {isCleanup(subtask) && <CleanupIcon className="mr-1 inline size-3.5 align-[-2px]" />}
        {subtask.title}
      </span>
      <span className="block truncate text-xs text-stone-500">
        {overdue && <span className="font-medium text-red-700">Overdue · </span>}
        {isCleanup(subtask) && 'Clean-up · '}
        {project.title}
        {subtask.end && ` · ${formatDateRange(subtask.start, subtask.end)}`}
      </span>
    </>
  )
}
