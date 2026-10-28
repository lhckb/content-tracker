import type { Project, Subtask } from '../types'
import { isCleanup, isPublish } from './subtasks'

// Published (Publish ticked) but not archived yet: the project sits under
// Wrapping up until it's archived, usually once its clean-up is done.
export function isWrappingUp(
  project: Pick<Project, 'archived'>,
  subtasks: readonly Pick<Subtask, 'kind' | 'done'>[],
): boolean {
  return !project.archived && subtasks.some((s) => isPublish(s) && s.done)
}

export function cleanupProgress(subtasks: readonly Pick<Subtask, 'kind' | 'done'>[]): {
  done: number
  total: number
} {
  const cleanup = subtasks.filter(isCleanup)
  return { done: cleanup.filter((s) => s.done).length, total: cleanup.length }
}
