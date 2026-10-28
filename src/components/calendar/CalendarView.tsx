import { DndContext, DragOverlay } from '@dnd-kit/core'
import { useMemo, useState } from 'react'
import type { TrackerData } from '../../data'
import {
  addMonthsISO,
  dayOfMonth,
  daysOfWeek,
  formatMonth,
  formatWeek,
  isSameMonth,
  monthOf,
  WEEKDAY_LABELS,
  weekOf,
  weeksOfMonth,
} from '../../lib/calendar'
import { addDaysISO, daysInRange } from '../../lib/dates'
import { applyPreview } from '../../lib/drag'
import type { ProjectWithSubtasks } from '../../lib/lanes'
import { groupByProject } from '../../lib/subtasks'
import type { ISODate, Project, Subtask } from '../../types'
import { PHONE_QUERY, useMediaQuery } from '../../hooks/useMediaQuery'
import { setDone } from '../actions'
import { cx } from '../cx'
import { PhoneChipPreview, PhoneMonth, PhoneWeek } from './PhoneCalendar'
import { useChipDrag } from './useChipDrag'
import { WeekRow, type CalendarActions, type CalendarMode } from './WeekRow'

export function CalendarView({
  data,
  today,
  onOpenProject,
  onOpenSubtask,
  onNotice,
}: {
  data: TrackerData | undefined
  today: ISODate
  onOpenProject: (projectId: string) => void
  onOpenSubtask: (subtaskId: string) => void
  onNotice: (message: string) => void
}) {
  const [mode, setMode] = useStoredMode()
  // A day inside the month or week on screen.
  const [anchor, setAnchor] = useState(today)
  const drag = useChipDrag(data, onNotice)
  const isPhone = useMediaQuery(PHONE_QUERY)

  // While a chip is dragged on the desktop grid, everything is laid out as if
  // it had already moved, so its band and lane redraw around it. The phone
  // lists stay put under the finger and highlight the target days instead.
  const items = useMemo((): ProjectWithSubtasks[] => {
    if (!data) return []
    const shown = isPhone ? data : applyPreview(data, drag.preview)
    const subtasksByProject = groupByProject(shown.subtasks)
    return shown.projects.map((project) => ({
      project,
      subtasks: subtasksByProject.get(project.id) ?? [],
    }))
  }, [data, drag.preview, isPhone])

  const targetDays = useMemo(
    () => new Set(drag.preview ? daysInRange(drag.preview.range.start, drag.preview.range.end) : []),
    [drag.preview],
  )
  const draggedProject =
    drag.activeSubtask && data?.projects.find((p) => p.id === drag.activeSubtask?.projectId)

  const month = monthOf(anchor)
  const week = weekOf(anchor)
  const weeks = mode === 'month' ? weeksOfMonth(month) : [week]
  const showsToday = mode === 'month' ? isSameMonth(anchor, today) : week === weekOf(today)

  function step(direction: 1 | -1) {
    setAnchor(mode === 'month' ? addMonthsISO(month, direction) : addDaysISO(week, 7 * direction))
  }

  function switchTo(next: CalendarMode) {
    // From a month to the week with today in it, or else its first week.
    if (next === 'week' && mode === 'month') setAnchor(isSameMonth(anchor, today) ? today : month)
    setMode(next)
  }

  const actions: CalendarActions = {
    onOpenProject: (id) => {
      if (!drag.wasJustDropped()) onOpenProject(id)
    },
    onOpenSubtask: (id) => {
      if (!drag.wasJustDropped()) onOpenSubtask(id)
    },
    onToggleDone: (subtask: Subtask, project: Project, done: boolean) => {
      void setDone(subtask, project, done).then(({ notice }) => {
        if (notice) onNotice(notice)
      })
    },
  }

  return (
    <section aria-label="Calendar" className="flex flex-col gap-3">
      {/* When a phone is too narrow for it all, the view toggle wraps to its
          own row rather than the title breaking. */}
      <div className="flex flex-wrap items-center gap-x-1 gap-y-2">
        <NavButton label={`Previous ${mode}`} onClick={() => step(-1)}>
          ‹
        </NavButton>
        <h2 className="text-center text-base font-semibold whitespace-nowrap md:min-w-48 md:text-lg">
          {mode === 'month' ? formatMonth(month) : formatWeek(week)}
        </h2>
        <NavButton label={`Next ${mode}`} onClick={() => step(1)}>
          ›
        </NavButton>
        {!showsToday && (
          <button
            type="button"
            onClick={() => setAnchor(today)}
            className="ml-2 rounded-md border border-stone-300 px-2.5 py-1 text-sm hover:bg-stone-100"
          >
            Today
          </button>
        )}
        <div role="group" aria-label="View" className="ml-auto flex rounded-md border border-stone-300 p-0.5">
          {(['month', 'week'] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={mode === option}
              onClick={() => switchTo(option)}
              className={cx(
                'rounded px-3 py-1 text-sm max-md:py-2',
                mode === option ? 'bg-stone-200 font-medium' : 'text-stone-600 hover:bg-stone-100',
              )}
            >
              {option === 'month' ? 'Month' : 'Week'}
            </button>
          ))}
        </div>
      </div>

      <DndContext {...drag.dndProps}>
        {isPhone ? (
          <>
            {mode === 'month' ? (
              <PhoneMonth
                month={month}
                items={items}
                today={today}
                targetDays={targetDays}
                draggingId={drag.activeSubtask?.id ?? null}
                actions={actions}
              />
            ) : (
              <PhoneWeek
                week={week}
                items={items}
                today={today}
                targetDays={targetDays}
                draggingId={drag.activeSubtask?.id ?? null}
                actions={actions}
              />
            )}
            <DragOverlay dropAnimation={null}>
              {drag.activeSubtask && draggedProject && (
                <PhoneChipPreview task={{ subtask: drag.activeSubtask, project: draggedProject }} />
              )}
            </DragOverlay>
          </>
        ) : (
          <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
            <div className="grid grid-cols-7 border-b border-stone-200 text-center text-xs font-medium text-stone-500">
              {mode === 'month'
                ? WEEKDAY_LABELS.map((label) => (
                    <div key={label} className="py-2">
                      {label}
                    </div>
                  ))
                : daysOfWeek(week).map((day, i) => (
                    <div key={day} className={cx('py-2', day === today && 'font-semibold text-stone-900')}>
                      {WEEKDAY_LABELS[i]} {dayOfMonth(day)}
                      {day === today && ' · Today'}
                    </div>
                  ))}
            </div>
            {weeks.map((weekStart) => (
              <WeekRow
                key={weekStart}
                mode={mode}
                weekStart={weekStart}
                month={mode === 'month' ? month : null}
                today={today}
                items={items}
                liftedId={drag.preview?.subtaskId ?? null}
                actions={actions}
              />
            ))}
          </div>
        )}
      </DndContext>
    </section>
  )
}

// Month or week, remembered in this browser between visits.
const MODE_KEY = 'content-tracker:calendar-mode'

function useStoredMode() {
  const [mode, setMode] = useState<CalendarMode>(() => {
    try {
      return localStorage.getItem(MODE_KEY) === 'week' ? 'week' : 'month'
    } catch {
      return 'month'
    }
  })
  function update(next: CalendarMode) {
    setMode(next)
    try {
      localStorage.setItem(MODE_KEY, next)
    } catch {
      // Storage blocked (e.g. private browsing): the choice lasts this visit.
    }
  }
  return [mode, update] as const
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
      className="rounded-md px-2 py-0.5 text-xl leading-none text-stone-600 hover:bg-stone-100 max-md:grid max-md:size-10 max-md:place-items-center max-md:p-0"
    >
      {children}
    </button>
  )
}
