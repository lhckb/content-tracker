import { describe, expect, it } from 'vitest'
import type { Project, Subtask } from '../types'
import { findRepairs } from './repairs'

function project(id: string, fields: Partial<Project> = {}): Project {
  return {
    id,
    title: id,
    platform: 'youtube',
    color: 'blue',
    publishDate: '2026-11-14',
    notes: '',
    archived: false,
    ...fields,
  }
}

function publish(id: string, projectId: string, start: string): Subtask {
  return { id, projectId, kind: 'publish', title: 'Publish', start, done: false, notes: '', order: 9 }
}

describe('findRepairs', () => {
  it('finds nothing to fix in consistent data', () => {
    const projects = [project('a'), project('b', { color: 'green' })]
    const subtasks = [publish('pa', 'a', '2026-11-14'), publish('pb', 'b', '2026-11-14')]
    expect(findRepairs(projects, subtasks)).toEqual({ publishDates: [], colors: [] })
  })

  it('puts a drifted Publish subtask back on its project’s publish date', () => {
    const repairs = findRepairs([project('a')], [publish('pa', 'a', '2026-11-20')])
    expect(repairs.publishDates).toEqual([{ subtaskId: 'pa', date: '2026-11-14' }])
  })

  it('leaves the shared color with the smaller id and gives the other a free one', () => {
    const repairs = findRepairs([project('b'), project('a')], [])
    expect(repairs.colors).toEqual([{ projectId: 'b', color: 'green' }])
  })

  it('ignores archived projects, which are gray anyway', () => {
    const repairs = findRepairs([project('a'), project('b', { archived: true })], [])
    expect(repairs.colors).toEqual([])
  })
})
