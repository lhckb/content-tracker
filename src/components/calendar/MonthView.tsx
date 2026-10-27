import { useMemo, useState } from 'react'
import type { TrackerData } from '../../data'
import {
  addMonthsISO,
  formatMonth,
  isSameMonth,
  monthOf,
  WEEKDAY_LABELS,
  weeksOfMonth,
} from '../../lib/calendar'
import type { ProjectWithSubtasks } from '../../lib/lanes'
import { groupByProject } from '../../lib/subtasks'
import type { ISODate } from '../../types'
import { WeekRow } from './WeekRow'

export function MonthView({ data, today }: { data: TrackerData | undefined; today: ISODate }) {
  const [month, setMonth] = useState(() => monthOf(today))

  const items = useMemo((): ProjectWithSubtasks[] => {
    if (!data) return []
    const subtasksByProject = groupByProject(data.subtasks)
    return data.projects.map((project) => ({
      project,
      subtasks: subtasksByProject.get(project.id) ?? [],
    }))
  }, [data])

  return (
    <section aria-label="Calendar" className="flex flex-col gap-3">
      <div className="flex items-center gap-1">
        <NavButton label="Previous month" onClick={() => setMonth(addMonthsISO(month, -1))}>
          ‹
        </NavButton>
        <h2 className="min-w-40 text-center text-lg font-semibold">{formatMonth(month)}</h2>
        <NavButton label="Next month" onClick={() => setMonth(addMonthsISO(month, 1))}>
          ›
        </NavButton>
        {!isSameMonth(month, today) && (
          <button
            type="button"
            onClick={() => setMonth(monthOf(today))}
            className="ml-2 rounded-md border border-stone-300 px-2.5 py-1 text-sm hover:bg-stone-100"
          >
            Today
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
        <div className="grid grid-cols-7 border-b border-stone-200 text-center text-xs font-medium text-stone-500">
          {WEEKDAY_LABELS.map((label) => (
            <div key={label} className="py-2">
              {label}
            </div>
          ))}
        </div>
        {weeksOfMonth(month).map((weekStart) => (
          <WeekRow
            key={weekStart}
            weekStart={weekStart}
            month={month}
            today={today}
            items={items}
          />
        ))}
      </div>
    </section>
  )
}

function NavButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="rounded-md px-2 py-0.5 text-xl leading-none text-stone-600 hover:bg-stone-100"
    >
      {children}
    </button>
  )
}
