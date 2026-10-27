import { useId, useState, type FormEvent } from 'react'
import { createProject } from '../../data'
import { isISODate } from '../../lib/dates'
import { PLATFORM_LABELS, PLATFORMS } from '../../lib/platforms'
import { DEFAULT_TASK_TITLES, PUBLISH_TITLE } from '../../lib/template'
import type { Platform } from '../../types'
import { cx } from '../cx'
import { CloseButton } from './Modal'

export function NewProjectDialog({
  onCancel,
  onCreated,
}: {
  onCancel: () => void
  onCreated: (projectId: string) => void
}) {
  const [title, setTitle] = useState('')
  const [platform, setPlatform] = useState<Platform>('youtube')
  const [publishDate, setPublishDate] = useState('')
  const [withDefaults, setWithDefaults] = useState(true)
  const [saving, setSaving] = useState(false)
  const id = useId()
  const valid = title.trim() !== '' && isISODate(publishDate)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!valid || saving) return
    setSaving(true)
    const projectId = await createProject({
      title,
      platform,
      publishDate,
      withDefaultSubtasks: withDefaults,
    })
    onCreated(projectId)
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 p-6">
      <header className="flex items-center">
        <h2 className="text-lg font-semibold">New project</h2>
        <CloseButton onClick={onCancel} />
      </header>

      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-title`} className="text-sm text-stone-600">
          Title
        </label>
        <input
          id={`${id}-title`}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="e.g. Desk setup tour"
          className="rounded-md border border-stone-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
        />
      </div>

      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-sm text-stone-600">Platform</legend>
        <div className="grid grid-cols-2 gap-1">
          {PLATFORMS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={platform === option}
              onClick={() => setPlatform(option)}
              className={cx(
                'rounded-md border py-2 text-sm',
                platform === option
                  ? 'border-stone-400 bg-stone-100 font-semibold'
                  : 'border-stone-300 hover:bg-stone-50',
              )}
            >
              {PLATFORM_LABELS[option]}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-date`} className="text-sm text-stone-600">
          Publish date
        </label>
        <input
          id={`${id}-date`}
          type="date"
          value={publishDate}
          onChange={(event) => setPublishDate(event.target.value)}
          className="rounded-md border border-stone-300 px-3 py-2 tabular-nums focus:border-blue-500 focus:outline-none"
        />
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={withDefaults}
          onChange={(event) => setWithDefaults(event.target.checked)}
          className="mt-0.5 size-4"
        />
        <span>
          Start with default subtasks
          <span className="block text-xs text-stone-500">
            {[...DEFAULT_TASK_TITLES, PUBLISH_TITLE].join(', ')}
          </span>
        </span>
      </label>

      <footer className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-stone-300 px-4 py-2 text-sm hover:bg-stone-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!valid || saving}
          className="rounded-md border border-blue-500 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-900 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Create
        </button>
      </footer>
    </form>
  )
}
