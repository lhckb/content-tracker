import { DndContext } from '@dnd-kit/core'
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
import { applyPreview } from '../../lib/drag'
import type { ProjectWithSubtasks } from '../../lib/lanes'
import { groupByProject } from '../../lib/subtasks'
import type { ISODate } from '../../types'
import { useChipDrag } from './useChipDrag'
import { WeekRow, type Openers } from './WeekRow'

export function MonthView({
  data,
  today,
  onOpenProject,
  onOpenSubtask,
  onNotice,
}: {
  data: TrackerData | undefined
  today: ISODate
  onNotice: (message: string) => void
} & Openers) {
  const [month, setMonth] = useState(() => monthOf(today))
  const drag = useChipDrag(data, onNotice)

  // While a chip is dragged, everything is laid out as if it had already
  // moved, so its band and lane redraw around it.
  const items = useMemo((): ProjectWithSubtasks[] => {
    if (!data) return []
    const shown = applyPreview(data, drag.preview)
    const subtasksByProject = groupByProject(shown.subtasks)
    return shown.projects.map((project) => ({
      project,
      subtasks: subtasksByProject.get(project.id) ?? [],
    }))
  }, [data, drag.preview])

  const openers: Openers = {
    onOpenProject: (id) => {
      if (!drag.wasJustDropped()) onOpenProject(id)
    },
    onOpenSubtask: (id) => {
      if (!drag.wasJustDropped()) onOpenSubtask(id)
    },
  }

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

      <DndContext {...drag.dndProps}>
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
              liftedId={drag.preview?.subtaskId ?? null}
              {...openers}
            />
          ))}
        </div>
      </DndContext>
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
