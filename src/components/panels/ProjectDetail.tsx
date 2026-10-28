import { useId, useState, type FormEvent } from 'react'
import {
  archiveProject,
  deleteProject,
  restoreProject,
  setProjectColor,
  shiftProject,
  updateProject,
} from '../../data'
import { useAutosave } from '../../hooks/useAutosave'
import { COLOR_HEX, COLOR_IDS, isColorAvailable, projectHex } from '../../lib/colors'
import { addDaysISO, formatDateRange, formatLongDate, isISODate } from '../../lib/dates'
import { isOverdue } from '../../lib/overdue'
import { PLATFORM_LABELS } from '../../lib/platforms'
import { getProgress } from '../../lib/progress'
import { includesDay, isPublish, sortSubtasks } from '../../lib/subtasks'
import type { ISODate, Project, Subtask } from '../../types'
import { addTask, movePublishDate, setDone } from '../actions'
import { ask } from '../ask'
import { cx } from '../cx'
import { ProgressBar } from '../ProgressBar'
import { DateField } from './DateField'
import { CloseButton } from './Modal'

const BUTTON =
  'rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50'

export function ProjectDetail({
  project,
  subtasks,
  otherActive,
  today,
  onOpenSubtask,
  onClose,
  onNotice,
}: {
  project: Project
  subtasks: Subtask[]
  // The other active projects, whose colors this one can't take.
  otherActive: Project[]
  today: ISODate
  onOpenSubtask: (subtaskId: string) => void
  onClose: () => void
  onNotice: (message: string) => void
}) {
  const title = useAutosave(
    project.title,
    (next) => void updateProject(project.id, { title: next.trim() }),
    { required: true },
  )
  const notes = useAutosave(project.notes, (next) => void updateProject(project.id, { notes: next }))
  const [publishError, setPublishError] = useState('')
  const [shifting, setShifting] = useState(false)
  const [adding, setAdding] = useState(false)
  const id = useId()
  const progress = getProgress(subtasks)
  const hex = projectHex(project)
  const otherPlatform = project.platform === 'youtube' ? 'instagram' : 'youtube'

  async function commitPublishDate(date: ISODate | undefined): Promise<boolean> {
    if (!date) return false
    const problem = await movePublishDate(project.id, date)
    setPublishError(problem ?? '')
    return problem === null
  }

  async function toggle(subtask: Subtask, done: boolean) {
    const { archived, notice } = await setDone(subtask, project, done)
    if (notice) onNotice(notice)
    if (archived) onClose()
  }

  async function archive() {
    await archiveProject(project.id)
    onNotice(`Archived "${project.title}".`)
    onClose()
  }

  async function remove() {
    const count = subtasks.length
    const sure = await ask(`Delete "${project.title}" and its ${count} subtasks? This can't be undone.`, {
      confirmLabel: 'Delete project',
      danger: true,
    })
    if (!sure) return
    await deleteProject(project.id)
    onNotice(`Deleted "${project.title}".`)
    onClose()
  }

  return (
    <div className="flex flex-col">
      <header className="flex items-center gap-3 px-6 pt-5">
        <span className="size-3.5 shrink-0 rounded-full" style={{ background: hex }} />
        <input
          aria-label="Project title"
          {...title}
          className="min-w-0 flex-1 rounded-md border border-transparent px-1.5 py-0.5 text-xl font-semibold hover:border-stone-200 focus:border-stone-300 focus:outline-none"
        />
        <button
          type="button"
          title={`Switch to ${PLATFORM_LABELS[otherPlatform]}`}
          onClick={() => void updateProject(project.id, { platform: otherPlatform })}
          className="shrink-0 rounded-full border border-stone-300 px-3 py-0.5 text-sm hover:bg-stone-50"
        >
          {PLATFORM_LABELS[project.platform]}
        </button>
        {project.archived && (
          <span className="shrink-0 rounded-full bg-stone-100 px-2.5 py-0.5 text-xs text-stone-500">
            Archived
          </span>
        )}
        <CloseButton onClick={onClose} />
      </header>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-6 pt-4 text-sm text-stone-600">
        <div className="flex items-center gap-2">
          Publish date
          <DateField label="Publish date" value={project.publishDate} onCommit={commitPublishDate} />
        </div>
        <div className="flex items-center gap-2">
          Color
          <ColorSwatches project={project} otherActive={otherActive} />
        </div>
        <button
          type="button"
          aria-expanded={shifting}
          onClick={() => setShifting((open) => !open)}
          className={cx(BUTTON, 'md:ml-auto')}
        >
          Shift project…
        </button>
      </div>
      {publishError && (
        <p role="alert" className="mx-6 mt-2 text-sm text-red-700">
          {publishError}
        </p>
      )}
      {shifting && (
        <ShiftForm
          project={project}
          onDone={(message) => {
            setShifting(false)
            setPublishError('')
            if (message) onNotice(message)
          }}
        />
      )}

      <div className="px-6 pt-4">
        <p className="mb-1.5 text-sm text-stone-600">Progress</p>
        <div className="flex items-center gap-4">
          <ProgressBar percent={progress.percent} color={hex} />
          <span className="text-sm font-semibold tabular-nums">
            {progress.done} of {progress.total} done · {progress.percent}%
          </span>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-6 border-t border-stone-200 px-6 py-5 md:grid-cols-2">
        <section aria-labelledby={`${id}-subtasks`}>
          <h3 id={`${id}-subtasks`} className="mb-2 text-sm font-semibold">
            Subtasks
          </h3>
          <ul className="flex flex-col gap-1.5">
            {sortSubtasks(subtasks).map((subtask) => (
              <SubtaskRow
                key={subtask.id}
                subtask={subtask}
                project={project}
                today={today}
                onToggle={(done) => void toggle(subtask, done)}
                onOpen={() => onOpenSubtask(subtask.id)}
              />
            ))}
          </ul>
          {adding ? (
            <AddSubtaskForm project={project} today={today} onDone={() => setAdding(false)} />
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="mt-1.5 w-full rounded-md border border-dashed border-stone-300 py-2 text-sm text-stone-500 hover:bg-stone-50"
            >
              + Add subtask
            </button>
          )}
        </section>

        <section className="flex flex-col">
          <label htmlFor={`${id}-notes`} className="mb-2 text-sm font-semibold">
            Notes
          </label>
          <textarea
            id={`${id}-notes`}
            {...notes}
            rows={12}
            placeholder="Ideas, script, shot list…"
            className="flex-1 resize-none rounded-md border border-stone-300 p-3 text-sm focus:border-blue-500 focus:outline-none"
          />
          <p className="mt-1 text-right text-xs text-stone-400">Saves as you type</p>
        </section>
      </div>

      <footer className="flex items-center justify-between border-t border-stone-200 px-6 py-4">
        <button type="button" onClick={() => void remove()} className="text-sm text-red-700 hover:underline">
          Delete project
        </button>
        {project.archived ? (
          <button
            type="button"
            onClick={() => {
              void restoreProject(project.id)
              onNotice(`Restored "${project.title}".`)
            }}
            className={BUTTON}
          >
            Restore project
          </button>
        ) : (
          <button type="button" onClick={() => void archive()} className={BUTTON}>
            Archive project
          </button>
        )}
      </footer>
    </div>
  )
}

function SubtaskRow({
  subtask,
  project,
  today,
  onToggle,
  onOpen,
}: {
  subtask: Subtask
  project: Project
  today: ISODate
  onToggle: (done: boolean) => void
  onOpen: () => void
}) {
  const publish = isPublish(subtask)
  const current = !subtask.done && includesDay(subtask, today)
  const overdue = !project.archived && isOverdue(subtask, today)
  const when =
    formatDateRange(subtask.start, subtask.end) +
    (publish ? ' · publish date' : current ? ' · today' : '')

  return (
    <li
      className={cx(
        'flex items-center rounded-md border text-sm',
        current ? 'border-blue-500 bg-stone-100' : 'border-stone-200',
      )}
    >
      <input
        type="checkbox"
        aria-label={`${subtask.title} done`}
        checked={subtask.done}
        onChange={(event) => onToggle(event.target.checked)}
        className="ml-3 size-4 shrink-0 max-md:size-5"
      />
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-2 py-2 pr-3 pl-3 text-left"
      >
        <span
          className={cx(
            'truncate',
            (publish || current) && 'font-semibold',
            subtask.done && 'text-stone-400',
          )}
        >
          {subtask.title}
        </span>
        {overdue && (
          <span
            role="img"
            aria-label="Overdue"
            title="Overdue"
            className="size-2 shrink-0 rounded-full bg-red-600"
          />
        )}
        <span
          className={cx(
            'ml-auto shrink-0 tabular-nums',
            current && 'font-semibold',
            subtask.done ? 'text-stone-400' : 'text-stone-600',
          )}
        >
          {when}
        </span>
        <span aria-hidden="true" className="text-stone-400">
          ›
        </span>
      </button>
    </li>
  )
}

function AddSubtaskForm({
  project,
  today,
  onDone,
}: {
  project: Project
  today: ISODate
  onDone: () => void
}) {
  const [title, setTitle] = useState('')
  // Today, unless that's past the publish date.
  const [start, setStart] = useState(() => (today <= project.publishDate ? today : project.publishDate))
  const valid = title.trim() !== '' && isISODate(start)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!valid) return
    if (await addTask(project.id, { title, start })) setTitle('')
  }

  return (
    <form
      onSubmit={submit}
      onKeyDown={(event) => {
        // Escape closes this row rather than the whole card.
        if (event.key !== 'Escape') return
        event.preventDefault()
        event.stopPropagation()
        onDone()
      }}
      className="mt-1.5 flex items-center gap-2 rounded-md border border-stone-300 p-1.5"
    >
      <input
        autoFocus
        aria-label="New subtask title"
        placeholder="Subtask name"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        className="min-w-0 flex-1 rounded px-2 py-1 text-sm focus:outline-none"
      />
      <input
        type="date"
        aria-label="New subtask date"
        value={start}
        onChange={(event) => setStart(event.target.value)}
        className="rounded border border-stone-300 px-1.5 py-1 text-sm tabular-nums"
      />
      <button type="submit" disabled={!valid} className={cx(BUTTON, 'py-1')}>
        Add
      </button>
      <button
        type="button"
        aria-label="Cancel adding a subtask"
        onClick={onDone}
        className="px-1 text-stone-500 hover:text-stone-800 max-md:px-3 max-md:py-2"
      >
        ✕
      </button>
    </form>
  )
}

function ShiftForm({ project, onDone }: { project: Project; onDone: (message?: string) => void }) {
  const [days, setDays] = useState('7')
  const count = Number(days)
  const valid = days.trim() !== '' && Number.isInteger(count) && count !== 0

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!valid) return
    await shiftProject(project.id, count)
    const direction = count > 0 ? 'later' : 'earlier'
    onDone(`Moved "${project.title}" ${Math.abs(count)} ${Math.abs(count) === 1 ? 'day' : 'days'} ${direction}.`)
  }

  return (
    <form
      onSubmit={submit}
      className="mx-6 mt-3 flex flex-wrap items-center gap-2 rounded-md bg-stone-100 px-3 py-2.5 text-sm"
    >
      <label className="flex items-center gap-2">
        Move every subtask and the publish date by
        <input
          type="number"
          step={1}
          value={days}
          onChange={(event) => setDays(event.target.value)}
          className="w-16 rounded border border-stone-300 bg-white px-2 py-1 tabular-nums"
        />
        days
      </label>
      <span className="text-stone-500">
        {valid
          ? `Publish moves to ${formatLongDate(addDaysISO(project.publishDate, count))}`
          : 'Use a negative number to move earlier'}
      </span>
      <span className="ml-auto flex gap-2">
        <button type="button" onClick={() => onDone()} className={BUTTON}>
          Cancel
        </button>
        <button type="submit" disabled={!valid} className={BUTTON}>
          Shift
        </button>
      </span>
    </form>
  )
}

function ColorSwatches({ project, otherActive }: { project: Project; otherActive: Project[] }) {
  const taken = otherActive.map((p) => p.color)
  return (
    <div role="group" aria-label="Color" className="flex items-center gap-1.5 max-md:gap-2">
      {COLOR_IDS.map((color) => {
        const current = project.color === color
        const owner = otherActive.find((p) => p.color === color)
        const available = current || project.archived || isColorAvailable(color, taken)
        const name = color[0].toUpperCase() + color.slice(1)
        const label = owner ? `${name}, used by ${owner.title}` : name
        return (
          <button
            key={color}
            type="button"
            aria-label={label}
            title={label}
            aria-pressed={current}
            disabled={!available}
            onClick={() => void setProjectColor(project.id, color)}
            className={cx(
              'size-5 rounded-full ring-offset-2 disabled:cursor-not-allowed disabled:opacity-25 max-md:size-7',
              current && 'ring-2 ring-stone-700',
            )}
            style={{ background: COLOR_HEX[color] }}
          />
        )
      })}
    </div>
  )
}
