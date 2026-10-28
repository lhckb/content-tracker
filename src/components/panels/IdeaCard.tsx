import { useId } from 'react'
import { deleteIdea, updateIdea } from '../../data'
import { useAutosave } from '../../hooks/useAutosave'
import { MONTH_NAMES, nextOccurrence, toISOMonth, yearOptions } from '../../lib/ideas'
import { PLATFORM_LABELS, PLATFORMS } from '../../lib/platforms'
import type { ISODate, Idea } from '../../types'
import { ask } from '../ask'
import { cx } from '../cx'
import { PlatformIcon } from '../PlatformIcon'
import { CloseButton } from './Modal'

export function IdeaCard({
  idea,
  today,
  onMakeProject,
  onClose,
}: {
  idea: Idea
  today: ISODate
  onMakeProject: () => void
  onClose: () => void
}) {
  const title = useAutosave(idea.title, (next) => void updateIdea(idea.id, { title: next.trim() }), {
    required: true,
  })
  const description = useAutosave(idea.description, (next) => void updateIdea(idea.id, { description: next }))
  const id = useId()
  const year = idea.month ? Number(idea.month.slice(0, 4)) : undefined
  const month = idea.month ? Number(idea.month.slice(5, 7)) : undefined

  // A month picked with no year yet takes its next occurrence; the year
  // list then adjusts it.
  function pickMonth(value: string) {
    if (!value) return void updateIdea(idea.id, { month: undefined })
    const picked = Number(value)
    void updateIdea(idea.id, { month: year ? toISOMonth(year, picked) : nextOccurrence(picked, today) })
  }

  async function remove() {
    if (!(await ask(`Delete "${idea.title}"?`, { confirmLabel: 'Delete', danger: true }))) return
    await deleteIdea(idea.id)
    onClose()
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <header className="flex items-center gap-2 text-sm text-stone-600">
        <PlatformIcon platform={idea.platform} className="size-4 shrink-0" />
        {PLATFORM_LABELS[idea.platform]} idea
        <CloseButton onClick={onClose} />
      </header>

      <input
        aria-label="Idea title"
        {...title}
        className="rounded-md border border-transparent px-1.5 py-0.5 text-xl font-semibold hover:border-stone-200 focus:border-stone-300 focus:outline-none"
      />

      <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-sm text-stone-600">Platform</legend>
          <div className="grid grid-cols-2 gap-1">
            {PLATFORMS.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={idea.platform === option}
                onClick={() => void updateIdea(idea.id, { platform: option })}
                className={cx(
                  'rounded-md border px-3 py-1.5 text-sm max-md:py-2',
                  idea.platform === option
                    ? 'border-stone-400 bg-stone-100 font-semibold'
                    : 'border-stone-300 hover:bg-stone-50',
                )}
              >
                {PLATFORM_LABELS[option]}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-sm text-stone-600">Month to work on it</legend>
          <div className="flex gap-2">
            <select
              aria-label="Month"
              value={month ?? ''}
              onChange={(event) => pickMonth(event.target.value)}
              className="rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none max-md:py-2 max-md:text-base"
            >
              <option value="">No month</option>
              {MONTH_NAMES.map((name, i) => (
                <option key={name} value={i + 1}>
                  {name}
                </option>
              ))}
            </select>
            <select
              aria-label="Year"
              value={year ?? ''}
              disabled={!month}
              onChange={(event) => month && void updateIdea(idea.id, { month: toISOMonth(Number(event.target.value), month) })}
              className="rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm tabular-nums focus:border-blue-500 focus:outline-none disabled:text-stone-400 max-md:py-2 max-md:text-base"
            >
              {!month && <option value="">Year</option>}
              {yearOptions(today, idea.month).map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        </fieldset>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-description`} className="text-sm text-stone-600">
          Description
        </label>
        <textarea
          id={`${id}-description`}
          {...description}
          rows={7}
          placeholder="The hook, the format, shots you picture…"
          className="resize-none rounded-md border border-stone-300 p-3 text-sm focus:border-blue-500 focus:outline-none max-md:text-base"
        />
        <p className="text-right text-xs text-stone-400">Saves as you type</p>
      </div>

      <footer className="flex items-center justify-between pt-1">
        <button type="button" onClick={() => void remove()} className="text-sm text-red-700 hover:underline">
          Delete idea
        </button>
        <button
          type="button"
          onClick={onMakeProject}
          className="rounded-md border border-blue-500 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-900 hover:bg-blue-100"
        >
          Make project
        </button>
      </footer>
    </div>
  )
}
