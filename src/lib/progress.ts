import type { Subtask } from '../types'

export interface Progress {
  done: number
  total: number
  percent: number
}

// Every task counts equally, Publish included, so a project only reaches
// 100% once the video is out. Clean-up tasks don't count.
export function getProgress(subtasks: readonly Pick<Subtask, 'done' | 'kind'>[]): Progress {
  const counted = subtasks.filter((s) => s.kind !== 'cleanup')
  const total = counted.length
  const done = counted.filter((s) => s.done).length
  const percent = total === 0 ? 0 : Math.round((done / total) * 100)
  return { done, total, percent }
}
