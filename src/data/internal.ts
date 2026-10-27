import type { ColorId, ISODate, Project, Subtask } from '../types'
import { db } from './db'

// Helpers shared by the data modules. Call them inside a transaction that
// covers the tables they touch.

export async function requireProject(id: string): Promise<Project> {
  const project = await db.projects.get(id)
  if (!project) throw new Error(`No project with id ${id}`)
  return project
}

export async function requireSubtask(id: string): Promise<Subtask> {
  const subtask = await db.subtasks.get(id)
  if (!subtask) throw new Error(`No subtask with id ${id}`)
  return subtask
}

export function subtasksOf(projectId: string) {
  return db.subtasks.where('projectId').equals(projectId)
}

export function newSubtask(
  projectId: string,
  fields: Pick<Subtask, 'title' | 'start' | 'order'> &
    Partial<Pick<Subtask, 'kind' | 'end'>>,
): Subtask {
  return {
    id: crypto.randomUUID(),
    projectId,
    kind: 'task',
    done: false,
    notes: '',
    ...fields,
  }
}

// Keeps the project's publish date and its Publish subtask in step.
export async function writePublishDate(projectId: string, date: ISODate): Promise<void> {
  await db.projects.update(projectId, { publishDate: date })
  await subtasksOf(projectId)
    .filter((s) => s.kind === 'publish')
    .modify({ start: date })
}

export async function activeColors(exceptProjectId?: string): Promise<ColorId[]> {
  const active = await db.projects
    .filter((p) => !p.archived && p.id !== exceptProjectId)
    .toArray()
  return active.map((p) => p.color)
}
