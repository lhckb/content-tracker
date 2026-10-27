import type { Subtask } from '../types'

export interface Progress {
  done: number
  total: number
  percent: number
}

// Every subtask counts equally, Publish included, so a project only reaches
// 100% once the video is out.
export function getProgress(subtasks: readonly Pick<Subtask, 'done'>[]): Progress {
  const total = subtasks.length
  const done = subtasks.filter((s) => s.done).length
  const percent = total === 0 ? 0 : Math.round((done / total) * 100)
  return { done, total, percent }
}
