import { useState, type ChangeEvent, type ReactNode } from 'react'
import {
  archiveProject,
  backupFileName,
  clearAllData,
  deleteProject,
  exportBackupText,
  importBackupText,
  restoreProject,
  shiftProject,
  updateSubtask,
  useTrackerData,
} from '../data'
import { ARCHIVED_HEX, COLOR_HEX } from '../lib/colors'
import { formatDateRange, formatShortDate, todayISO } from '../lib/dates'
import { hasOverdue, isOverdue } from '../lib/overdue'
import { PLATFORM_LABELS } from '../lib/platforms'
import { getProgress } from '../lib/progress'
import { getProjectSpan } from '../lib/span'
import { sortSubtasks } from '../lib/subtasks'
import type { ISODate, Project, Subtask } from '../types'
import { loadSampleData } from './sampleData'

type Run = (action: () => Promise<string | void>) => void

// Temporary milestone-1 screen: shows what's stored and exercises the data
// layer. The calendar replaces it in milestone 2.
export function DevScreen() {
  const data = useTrackerData()
  const [status, setStatus] = useState('')
  const today = todayISO()

  const run: Run = (action) => {
    action().then(
      (message) => setStatus(message ?? ''),
      (error: unknown) => setStatus(error instanceof Error ? error.message : String(error)),
    )
  }

  function confirmReplace(): boolean {
    return !data?.projects.length || confirm('This replaces everything stored. Continue?')
  }

  function onImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !confirmReplace()) return
    run(async () => {
      const counts = await importBackupText(await file.text())
      return `Imported ${counts.projects} projects and ${counts.subtasks} subtasks.`
    })
  }

  const projects = data ? [...data.projects].sort(activeFirstByPublishDate) : []

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <header>
        <h1 className="text-xl font-semibold">Content Tracker</h1>
        <p className="text-sm text-stone-500">
          Temporary data screen for milestone 1; the calendar replaces it in milestone 2.
          Today is {formatShortDate(today)}.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => {
            if (!confirmReplace()) return
            run(async () => {
              await loadSampleData()
              return 'Loaded sample data.'
            })
          }}
        >
          Load sample data
        </Button>
        <Button
          onClick={() =>
            run(async () => {
              downloadTextFile(backupFileName(), await exportBackupText())
              return 'Exported a backup file.'
            })
          }
        >
          Export backup
        </Button>
        <label className={BUTTON_CLASS}>
          Import backup…
          <input
            type="file"
            accept=".json,application/json"
            className="sr-only"
            onChange={onImport}
          />
        </label>
        <Button
          danger
          onClick={() => {
            if (!confirm('Delete every project?')) return
            run(async () => {
              await clearAllData()
              return 'Cleared all data.'
            })
          }}
        >
          Clear all
        </Button>
      </div>

      {status && (
        <p role="status" className="rounded bg-stone-100 px-3 py-2 text-sm">
          {status}
        </p>
      )}

      {data === undefined ? (
        <p className="text-stone-500">Loading…</p>
      ) : projects.length === 0 ? (
        <p className="text-stone-500">
          No projects yet. Load the sample data or import a backup.
        </p>
      ) : (
        <ul className="space-y-4">
          {projects.map((project) => (
            <ProjectRow
              key={project.id}
              project={project}
              subtasks={data.subtasks.filter((s) => s.projectId === project.id)}
              today={today}
              run={run}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function ProjectRow({
  project,
  subtasks,
  today,
  run,
}: {
  project: Project
  subtasks: Subtask[]
  today: ISODate
  run: Run
}) {
  const progress = getProgress(subtasks)
  const span = getProjectSpan(project, subtasks)
  const color = project.archived ? ARCHIVED_HEX : COLOR_HEX[project.color]

  return (
    <li
      className="space-y-3 rounded-lg border border-stone-200 bg-white p-4"
      style={{ borderLeft: `4px solid ${color}` }}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 font-medium">
            {project.title}
            {hasOverdue(project, subtasks, today) && (
              <span title="Has overdue subtasks" className="size-2 rounded-full bg-red-600" />
            )}
          </h2>
          <p className="text-sm text-stone-500">
            {PLATFORM_LABELS[project.platform]} · {project.color} · publish{' '}
            {formatShortDate(project.publishDate)} · band {formatDateRange(span.start, span.end)}
            {project.archived && ' · archived'}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button onClick={() => run(() => shiftProject(project.id, -1))}>−1 day</Button>
          <Button onClick={() => run(() => shiftProject(project.id, 1))}>+1 day</Button>
          {project.archived ? (
            <Button onClick={() => run(() => restoreProject(project.id))}>Restore</Button>
          ) : (
            <Button onClick={() => run(() => archiveProject(project.id))}>Archive</Button>
          )}
          <Button
            danger
            onClick={() => {
              if (confirm(`Delete "${project.title}"?`)) run(() => deleteProject(project.id))
            }}
          >
            Delete
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-200">
          <div
            className="h-full rounded-full"
            style={{ width: `${progress.percent}%`, background: color }}
          />
        </div>
        <span className="text-sm tabular-nums">
          {progress.done} of {progress.total} · {progress.percent}%
        </span>
      </div>

      <ul className="divide-y divide-stone-100 text-sm">
        {sortSubtasks(subtasks).map((subtask) => (
          <li key={subtask.id} className="flex items-center gap-3 py-1.5">
            <input
              type="checkbox"
              checked={subtask.done}
              onChange={(event) =>
                run(() => updateSubtask(subtask.id, { done: event.target.checked }))
              }
            />
            <span
              className={
                subtask.done
                  ? 'text-stone-400 line-through'
                  : subtask.kind === 'publish'
                    ? 'font-semibold'
                    : undefined
              }
            >
              {subtask.title}
            </span>
            <span className="ml-auto text-stone-500 tabular-nums">
              {formatDateRange(subtask.start, subtask.end)}
            </span>
            {!project.archived && isOverdue(subtask, today) && (
              <span className="text-xs font-medium text-red-600">overdue</span>
            )}
          </li>
        ))}
      </ul>
    </li>
  )
}

const BUTTON_CLASS =
  'cursor-pointer rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm hover:bg-stone-50 focus-within:ring-2 focus-within:ring-blue-500'

function Button({
  children,
  onClick,
  danger = false,
}: {
  children: ReactNode
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${BUTTON_CLASS} ${danger ? 'text-red-700' : ''}`}
    >
      {children}
    </button>
  )
}

function activeFirstByPublishDate(a: Project, b: Project): number {
  if (a.archived !== b.archived) return a.archived ? 1 : -1
  return a.publishDate.localeCompare(b.publishDate)
}

function downloadTextFile(fileName: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  setTimeout(() => URL.revokeObjectURL(url))
}
