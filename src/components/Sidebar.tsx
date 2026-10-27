import { useState } from 'react'
import { restoreProject, type TrackerData } from '../data'
import { projectHex } from '../lib/colors'
import { formatShortDate } from '../lib/dates'
import { hasOverdue } from '../lib/overdue'
import { PLATFORM_LABELS } from '../lib/platforms'
import { getProgress } from '../lib/progress'
import { groupByProject } from '../lib/subtasks'
import type { ISODate, Project, Subtask } from '../types'
import { cx } from './cx'
import { PlatformIcon } from './PlatformIcon'
import { ProgressBar } from './ProgressBar'

export function Sidebar({
  data,
  today,
  onOpenProject,
  className,
}: {
  data: TrackerData | undefined
  today: ISODate
  onOpenProject: (projectId: string) => void
  className?: string
}) {
  const [archiveOpen, setArchiveOpen] = useState(false)
  const subtasksByProject = groupByProject(data?.subtasks ?? [])
  const projects = data?.projects ?? []
  const active = projects.filter((p) => !p.archived).sort(byPublishDate)
  const archived = projects
    .filter((p) => p.archived)
    .sort(byPublishDate)
    .reverse()

  return (
    // A column beside the calendar on wider screens; the whole Projects tab
    // at phone width.
    <aside
      className={cx(
        'flex w-full shrink-0 flex-col gap-3 overflow-y-auto bg-white p-4 md:w-60 md:border-r md:border-stone-200',
        className,
      )}
    >
      <h2 className="text-sm font-medium text-stone-500">Active projects</h2>
      {data && active.length === 0 && (
        <p className="text-sm text-stone-500">
          No active projects yet. Use <span className="font-medium">+ New project</span> to plan
          your next video.
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {active.map((project) => (
          <li key={project.id}>
            <ProjectCard
              project={project}
              subtasks={subtasksByProject.get(project.id) ?? []}
              today={today}
              onOpen={() => onOpenProject(project.id)}
            />
          </li>
        ))}
      </ul>

      {archived.length > 0 && (
        <div className="mt-2 border-t border-stone-200 pt-3">
          <button
            type="button"
            aria-expanded={archiveOpen}
            onClick={() => setArchiveOpen((open) => !open)}
            className="text-sm text-stone-600 hover:text-stone-900 max-md:py-2"
          >
            {archiveOpen ? '▾' : '▸'} Archive · {archived.length}{' '}
            {archived.length === 1 ? 'project' : 'projects'}
          </button>
          {archiveOpen && (
            <ul className="mt-2 flex flex-col gap-1">
              {archived.map((project) => (
                <li key={project.id} className="rounded-md px-2 py-1.5 text-sm hover:bg-stone-50">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      title="Open this project"
                      onClick={() => onOpenProject(project.id)}
                      className="min-w-0 flex-1 truncate text-left text-stone-600 hover:underline"
                    >
                      {project.title}
                    </button>
                    <button
                      type="button"
                      onClick={() => void restoreProject(project.id)}
                      className="shrink-0 rounded border border-stone-300 px-2 py-0.5 text-xs text-stone-600 hover:bg-white max-md:px-3 max-md:py-2 max-md:text-sm"
                    >
                      Restore
                    </button>
                  </div>
                  <p className="truncate text-xs text-stone-400">
                    {PLATFORM_LABELS[project.platform]} · published{' '}
                    {formatShortDate(project.publishDate)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </aside>
  )
}

function ProjectCard({
  project,
  subtasks,
  today,
  onOpen,
}: {
  project: Project
  subtasks: Subtask[]
  today: ISODate
  onOpen: () => void
}) {
  const progress = getProgress(subtasks)
  const color = projectHex(project)
  return (
    <button
      type="button"
      onClick={onOpen}
      className="relative block w-full overflow-hidden rounded-lg border border-stone-200 bg-white py-2.5 pr-3 pl-4 text-left shadow-xs hover:border-stone-300 hover:shadow-sm"
    >
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: color }} />
      <span className="flex items-start justify-between gap-2">
        <span className="text-sm leading-snug font-semibold">{project.title}</span>
        {hasOverdue(project, subtasks, today) && (
          <span
            role="img"
            aria-label="Has overdue subtasks"
            title="Has overdue subtasks"
            className="mt-1.5 size-2 shrink-0 rounded-full bg-red-600"
          />
        )}
      </span>
      <span className="mt-0.5 flex items-center gap-1 text-xs text-stone-500">
        <PlatformIcon platform={project.platform} className="size-3.5 shrink-0" />
        {PLATFORM_LABELS[project.platform]} · publish {formatShortDate(project.publishDate)}
      </span>
      <span className="mt-2 flex items-center gap-2">
        <ProgressBar percent={progress.percent} color={color} />
        <span className="w-9 text-right text-xs font-medium tabular-nums">{progress.percent}%</span>
      </span>
    </button>
  )
}

function byPublishDate(a: Project, b: Project): number {
  return a.publishDate.localeCompare(b.publishDate) || a.title.localeCompare(b.title)
}
