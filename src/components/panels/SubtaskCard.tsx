import { useId, useState } from 'react'
import { deleteSubtask, updateSubtask } from '../../data'
import { useAutosave } from '../../hooks/useAutosave'
import { projectHex } from '../../lib/colors'
import { addDaysISO, daysBetween } from '../../lib/dates'
import { isPublish } from '../../lib/subtasks'
import type { ISODate, Project, Subtask } from '../../types'
import { movePublishDate, moveTask, setDone } from '../actions'
import { ask } from '../ask'
import { DateField } from './DateField'
import { CloseButton } from './Modal'

export function SubtaskCard({
  subtask,
  project,
  onBack,
  onClose,
  onNotice,
}: {
  subtask: Subtask
  project: Project
  onBack: () => void
  onClose: () => void
  onNotice: (message: string) => void
}) {
  const publish = isPublish(subtask)
  const title = useAutosave(
    subtask.title,
    (next) => void updateSubtask(subtask.id, { title: next.trim() }),
    { required: true },
  )
  const notes = useAutosave(subtask.notes, (next) => void updateSubtask(subtask.id, { notes: next }))
  const [error, setError] = useState('')
  const id = useId()

  // Runs a date change and resolves whether it saved. `change` resolves
  // true/false (moveTask: false when declined) or null/a reason it was
  // refused (movePublishDate), which is shown under the dates.
  async function commit(change: () => Promise<boolean | string | null>): Promise<boolean> {
    try {
      const result = await change()
      setError(typeof result === 'string' ? result : '')
      return result === true || result === null
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      return false
    }
  }

  // A new start moves the whole range, keeping its length.
  function commitStart(start: ISODate | undefined) {
    if (!start) return Promise.resolve(false)
    const end = subtask.end && addDaysISO(subtask.end, daysBetween(subtask.start, start))
    return commit(() => moveTask(subtask, { start, end }))
  }

  function commitEnd(end: ISODate | undefined) {
    if (end && end < subtask.start) {
      setError("The end can't be before the start.")
      return Promise.resolve(false)
    }
    return commit(() => moveTask(subtask, { start: subtask.start, end }))
  }

  async function toggle(done: boolean) {
    const { archived, notice } = await setDone(subtask, project, done)
    if (notice) onNotice(notice)
    if (archived) onClose()
  }

  async function remove() {
    if (!(await ask(`Delete "${subtask.title}"?`, { confirmLabel: 'Delete', danger: true }))) return
    await deleteSubtask(subtask.id)
    onBack()
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <header className="flex items-center gap-2 text-sm text-stone-600">
        <span className="size-2.5 shrink-0 rounded-full" style={{ background: projectHex(project) }} />
        <button type="button" onClick={onBack} className="truncate hover:underline">
          {project.title}
        </button>
        <CloseButton onClick={onClose} />
      </header>

      {publish ? (
        <h2 className="px-1.5 text-xl font-semibold">{subtask.title}</h2>
      ) : (
        <input
          aria-label="Subtask title"
          {...title}
          className="rounded-md border border-transparent px-1.5 py-0.5 text-xl font-semibold hover:border-stone-200 focus:border-stone-300 focus:outline-none"
        />
      )}

      <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-sm text-stone-600">
            {publish ? 'Publish date' : 'Date or range'}
          </legend>
          {publish ? (
            <DateField
              label="Publish date"
              value={project.publishDate}
              onCommit={(date) => (date ? commit(() => movePublishDate(project.id, date)) : Promise.resolve(false))}
            />
          ) : (
            <>
              <div className="flex items-center gap-2">
                <DateField label="Start date" value={subtask.start} onCommit={commitStart} />
                <span className="text-stone-400">–</span>
                <DateField
                  label="End date"
                  value={subtask.end}
                  optional
                  min={subtask.start}
                  onCommit={commitEnd}
                />
                {subtask.end && (
                  <button
                    type="button"
                    aria-label="Make it a single day"
                    title="Make it a single day"
                    onClick={() => void commitEnd(undefined)}
                    className="px-1 text-stone-500 hover:text-stone-800 max-md:px-3 max-md:py-2"
                  >
                    ✕
                  </button>
                )}
              </div>
              <p className="text-xs text-stone-400">Leave the end empty for a single day.</p>
            </>
          )}
        </fieldset>

        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-sm text-stone-600">Status</legend>
          <label className="flex items-center gap-2 rounded-md border border-stone-300 px-3 py-1.5 text-sm">
            <input
              type="checkbox"
              checked={subtask.done}
              onChange={(event) => void toggle(event.target.checked)}
              className="size-4"
            />
            Mark as done
          </label>
        </fieldset>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-notes`} className="text-sm text-stone-600">
          Notes
        </label>
        <textarea
          id={`${id}-notes`}
          {...notes}
          rows={5}
          className="resize-none rounded-md border border-stone-300 p-3 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>

      <footer className="flex items-center justify-between pt-1">
        {publish ? (
          <span />
        ) : (
          <button type="button" onClick={() => void remove()} className="text-sm text-red-700 hover:underline">
            Delete
          </button>
        )}
        <button
          type="button"
          onClick={onBack}
          className="rounded-md border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50"
        >
          Back to project
        </button>
      </footer>
    </div>
  )
}
