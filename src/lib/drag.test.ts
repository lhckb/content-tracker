import { describe, expect, it } from 'vitest'
import type { Project, Subtask } from '../types'
import { applyPreview, draggedRange } from './drag'

describe('draggedRange', () => {
  const edit = { start: '2026-11-05', end: '2026-11-06' }

  it('moves a range by the days between where it was grabbed and dropped', () => {
    // Grabbed on its second day, dropped three days later.
    expect(draggedRange(edit, 'move', '2026-11-06', '2026-11-09')).toEqual({
      start: '2026-11-08',
      end: '2026-11-09',
    })
    expect(draggedRange({ start: '2026-11-05' }, 'move', '2026-11-05', '2026-11-02')).toEqual({
      start: '2026-11-02',
    })
  })

  it('drags the start edge, stopping at the end', () => {
    expect(draggedRange(edit, 'resize-start', '2026-11-05', '2026-11-03')).toEqual({
      start: '2026-11-03',
      end: '2026-11-06',
    })
    expect(draggedRange(edit, 'resize-start', '2026-11-05', '2026-11-09')).toEqual({
      start: '2026-11-06',
    })
  })

  it('drags the end edge, stopping at the start', () => {
    expect(draggedRange(edit, 'resize-end', '2026-11-06', '2026-11-10')).toEqual({
      start: '2026-11-05',
      end: '2026-11-10',
    })
    expect(draggedRange(edit, 'resize-end', '2026-11-06', '2026-11-01')).toEqual({
      start: '2026-11-05',
    })
  })

  it('turns a single day into a range by its edges', () => {
    expect(draggedRange({ start: '2026-11-05' }, 'resize-end', '2026-11-05', '2026-11-07')).toEqual({
      start: '2026-11-05',
      end: '2026-11-07',
    })
    expect(draggedRange({ start: '2026-11-05' }, 'resize-start', '2026-11-05', '2026-11-04')).toEqual({
      start: '2026-11-04',
      end: '2026-11-05',
    })
  })
})

describe('applyPreview', () => {
  const project: Project = {
    id: 'p',
    title: 'Vlog',
    platform: 'youtube',
    color: 'blue',
    publishDate: '2026-11-14',
    notes: '',
    archived: false,
  }
  const base = { id: 'x', projectId: 'p', done: false, notes: '', order: 0 }
  const edit: Subtask = { ...base, id: 'edit', kind: 'task', title: 'Edit', start: '2026-11-05', end: '2026-11-06' }
  const publish: Subtask = { ...base, id: 'pub', kind: 'publish', title: 'Publish', start: '2026-11-14' }
  const data = { projects: [project], subtasks: [edit, publish] }

  it('puts the dragged subtask on its new dates', () => {
    const shown = applyPreview(data, { subtaskId: 'edit', range: { start: '2026-11-09' } })
    expect(shown.subtasks[0]).toMatchObject({ start: '2026-11-09', end: undefined })
    expect(shown.projects[0].publishDate).toBe('2026-11-14')
  })

  it('moves the publish date along with the Publish chip', () => {
    const shown = applyPreview(data, { subtaskId: 'pub', range: { start: '2026-11-20' } })
    expect(shown.projects[0].publishDate).toBe('2026-11-20')
  })

  it('leaves the data alone without a preview', () => {
    expect(applyPreview(data, null)).toBe(data)
  })
})
