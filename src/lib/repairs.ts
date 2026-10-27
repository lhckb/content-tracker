import type { ColorId, ISODate, Project, Subtask } from '../types'
import { isColorAvailable, pickColor } from './colors'
import { isPublish } from './subtasks'

export interface Repairs {
  publishDates: { subtaskId: string; date: ISODate }[]
  colors: { projectId: string; color: ColorId }[]
}

// Fixes for states that edits on two devices can leave behind once synced,
// though each device kept the rules on its own:
// - a Publish subtask off its project's publish date (the project wins);
// - two active projects with the same color while a free color exists
//   (the project with the smaller id keeps it, so every device agrees).
export function findRepairs(
  projects: readonly Project[],
  subtasks: readonly Subtask[],
): Repairs {
  const publishDateOf = new Map(projects.map((p) => [p.id, p.publishDate]))
  const publishDates = subtasks.flatMap((subtask) => {
    const date = publishDateOf.get(subtask.projectId)
    if (!isPublish(subtask) || !date) return []
    return subtask.start === date && subtask.end === undefined ? [] : [{ subtaskId: subtask.id, date }]
  })

  const colors: Repairs['colors'] = []
  const taken: ColorId[] = []
  const active = projects.filter((p) => !p.archived).sort((a, b) => a.id.localeCompare(b.id))
  for (const project of active) {
    const color = isColorAvailable(project.color, taken) ? project.color : pickColor(taken)
    if (color !== project.color) colors.push({ projectId: project.id, color })
    taken.push(color)
  }

  return { publishDates, colors }
}
