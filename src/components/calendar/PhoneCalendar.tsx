import { useDraggable } from '@dnd-kit/core'
import { useMemo, useState } from 'react'
import { tasksOnDays, type DayTask } from '../../lib/agenda'
import {
  dayOfMonth,
  daysOfWeek,
  isSameMonth,
  WEEKDAY_LABELS,
  weeksOfMonth,
} from '../../lib/calendar'
import { projectHex } from '../../lib/colors'
import { formatDateRange, formatLongDate, formatShortDate } from '../../lib/dates'
import type { ProjectWithSubtasks } from '../../lib/lanes'
import { isOverdue } from '../../lib/overdue'
import { isPublish } from '../../lib/subtasks'
import type { ISODate } from '../../types'
import { cx } from '../cx'
import { stopDragStart, type ChipDragData } from './useChipDrag'
import type { CalendarActions } from './WeekRow'

// The calendar at phone width, where seven columns are too narrow for named
// chips: the month shows colored bars per day plus the chosen day's tasks
// below, and the week is a list of days. Every day area carries data-day,
// so press-and-hold dragging can drop a task on it (see useChipDrag).

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
        <div className="grid grid-cols-7">
          {days.map((day, i) => {
            const tasks = byDay.get(day) ?? []
            const inMonth = isSameMonth(day, month)
            return (
              <button
                key={day}
                type="button"
                data-day={day}
                aria-pressed={day === selected}
                aria-label={`${formatLongDate(day)}, ${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'}`}
                onClick={() => setSelected(day)}
                className={cx(
                  'flex h-16 touch-manipulation flex-col items-center gap-1 pt-1',
                  i % 7 > 0 && 'border-l border-stone-100',
                  i >= 7 && 'border-t border-stone-100',
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
                <DayBars tasks={tasks} today={today} />
              </button>
            )
          })}
        </div>
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

  return (
    <div className="flex flex-col gap-2">
      {days.map((day, i) => (
        <section
          key={day}
          data-day={day}
          aria-label={formatLongDate(day)}
          className={cx(
            'rounded-lg border p-2',
            targetDays.has(day) ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500' : 'bg-white',
            !targetDays.has(day) && (day === today ? 'border-stone-400' : 'border-stone-200'),
          )}
        >
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
        </section>
      ))}
    </div>
  )
}

// Up to three bars, one per task that day, then "+N".
function DayBars({ tasks, today }: { tasks: DayTask[]; today: ISODate }) {
  return (
    <span className="flex w-full flex-col gap-0.5 px-1.5" aria-hidden="true">
      {tasks.slice(0, 3).map(({ subtask, project }) => (
        <span
          key={subtask.id}
          className={cx('h-1 rounded-full', subtask.done && 'opacity-40')}
          style={{
            background:
              !project.archived && isOverdue(subtask, today) ? '#dc2626' : projectHex(project),
          }}
        />
      ))}
      {tasks.length > 3 && (
        <span className="text-[9px] leading-none text-stone-500">+{tasks.length - 3}</span>
      )}
    </span>
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
        aria-label={`${project.title}: ${subtask.title}, ${formatDateRange(subtask.start, subtask.end)}${
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
        {subtask.title}
      </span>
      <span className="block truncate text-xs text-stone-500">
        {overdue && <span className="font-medium text-red-700">Overdue · </span>}
        {project.title}
        {subtask.end && ` · ${formatDateRange(subtask.start, subtask.end)}`}
      </span>
    </>
  )
}
