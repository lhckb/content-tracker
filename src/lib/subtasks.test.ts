import { describe, expect, it } from 'vitest'
import type { Subtask } from '../types'
import { endsAfter, normalizeRange, sortSubtasks, tasksEndingAfter } from './subtasks'

function subtask(fields: Partial<Subtask> & Pick<Subtask, 'title' | 'start'>): Subtask {
  return { id: fields.title, projectId: 'p', kind: 'task', done: false, notes: '', order: 0, ...fields }
}

describe('normalizeRange', () => {
  it('stores a one-day subtask without an end', () => {
    expect(normalizeRange('2026-11-05')).toEqual({ start: '2026-11-05' })
    expect(normalizeRange('2026-11-05', '')).toEqual({ start: '2026-11-05' })
    expect(normalizeRange('2026-11-05', '2026-11-05')).toEqual({ start: '2026-11-05' })
  })

  it('keeps a real range', () => {
    expect(normalizeRange('2026-11-05', '2026-11-06')).toEqual({
      start: '2026-11-05',
      end: '2026-11-06',
    })
  })

  it('rejects a range that ends before it starts, or a bad date', () => {
    expect(() => normalizeRange('2026-11-06', '2026-11-05')).toThrow()
    expect(() => normalizeRange('2026-02-30')).toThrow()
  })
})

describe('sortSubtasks', () => {
  it('orders by date, keeps Publish last and breaks ties by order', () => {
    const sorted = sortSubtasks([
      subtask({ title: 'Publish', kind: 'publish', start: '2026-11-14' }),
      subtask({ title: 'Edit', start: '2026-11-05', end: '2026-11-06' }),
      subtask({ title: 'Late', start: '2026-11-20' }),
      subtask({ title: 'B', start: '2026-11-05', order: 2 }),
      subtask({ title: 'A', start: '2026-11-05', order: 1 }),
    ])
    expect(sorted.map((s) => s.title)).toEqual(['A', 'B', 'Edit', 'Late', 'Publish'])
  })

  it('puts clean-up tasks after Publish, by date', () => {
    const sorted = sortSubtasks([
      subtask({ title: 'Stories', kind: 'cleanup', start: '2026-11-16' }),
      subtask({ title: 'Backup', kind: 'cleanup', start: '2026-11-02' }),
      subtask({ title: 'Publish', kind: 'publish', start: '2026-11-14' }),
      subtask({ title: 'Edit', start: '2026-11-10' }),
    ])
    expect(sorted.map((s) => s.title)).toEqual(['Edit', 'Publish', 'Backup', 'Stories'])
  })
})

describe('guard rail', () => {
  it('allows ending on the publish date but not after it', () => {
    expect(endsAfter({ start: '2026-11-14' }, '2026-11-14')).toBe(false)
    expect(endsAfter({ start: '2026-11-13', end: '2026-11-15' }, '2026-11-14')).toBe(true)
  })

  it('finds the tasks a new publish date would cut off, ignoring Publish', () => {
    const subtasks = [
      subtask({ title: 'Edit', start: '2026-11-10', end: '2026-11-12' }),
      subtask({ title: 'Thumbnail', start: '2026-11-13' }),
      subtask({ title: 'Publish', kind: 'publish', start: '2026-11-14' }),
    ]
    expect(tasksEndingAfter(subtasks, '2026-11-11').map((s) => s.title)).toEqual([
      'Edit',
      'Thumbnail',
    ])
    expect(tasksEndingAfter(subtasks, '2026-11-13')).toEqual([])
  })

  it('never counts clean-up tasks', () => {
    const subtasks = [subtask({ title: 'Stories', kind: 'cleanup', start: '2026-11-20' })]
    expect(tasksEndingAfter(subtasks, '2026-11-14')).toEqual([])
  })
})
