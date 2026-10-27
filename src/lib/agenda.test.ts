import { describe, expect, it } from 'vitest'
import type { Project, Subtask } from '../types'
import { tasksOnDays } from './agenda'

function project(id: string, publishDate: string): Project {
  return { id, title: id, platform: 'youtube', color: 'blue', publishDate, notes: '', archived: false }
}

function subtask(id: string, projectId: string, start: string, end?: string): Subtask {
  return {
    id,
    projectId,
    kind: 'task',
    title: id,
    start,
    ...(end ? { end } : {}),
    done: false,
    notes: '',
    order: 0,
  }
}

describe('tasksOnDays', () => {
  const later = project('later', '2026-11-20')
  const sooner = project('sooner', '2026-11-10')
  const items = [
    { project: later, subtasks: [subtask('edit', 'later', '2026-11-05', '2026-11-07')] },
    {
      project: sooner,
      subtasks: [subtask('script', 'sooner', '2026-11-06'), subtask('b-roll', 'sooner', '2026-11-05')],
    },
  ]
  const days = ['2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07']

  it('lists every task covering each day, soonest-publishing project first', () => {
    const byDay = tasksOnDays(items, days)
    const ids = (day: string) => byDay.get(day)?.map((t) => t.subtask.id)
    expect(ids('2026-11-04')).toEqual([])
    expect(ids('2026-11-05')).toEqual(['b-roll', 'edit'])
    expect(ids('2026-11-06')).toEqual(['script', 'edit'])
    expect(ids('2026-11-07')).toEqual(['edit'])
  })

  it('pairs each task with its project', () => {
    const [first] = tasksOnDays(items, ['2026-11-06']).get('2026-11-06') ?? []
    expect(first.project.id).toBe('sooner')
  })
})
