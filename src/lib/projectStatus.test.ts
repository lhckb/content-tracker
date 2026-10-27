import { describe, expect, it } from 'vitest'
import { pickColor, isColorAvailable, COLOR_IDS } from './colors'
import { hasOverdue, isOverdue } from './overdue'
import { getProgress } from './progress'
import { shiftRange } from './shift'
import { getProjectSpan } from './span'
import { defaultTasks } from './template'
import type { Subtask } from '../types'

const TODAY = '2026-11-05'

describe('getProgress', () => {
  it('weights every subtask equally and rounds the percentage', () => {
    expect(getProgress([{ done: true }, { done: false }, { done: false }])).toEqual({
      done: 1,
      total: 3,
      percent: 33,
    })
    expect(getProgress([])).toEqual({ done: 0, total: 0, percent: 0 })
  })
})

describe('overdue', () => {
  it('flags an undone subtask whose last day is before today', () => {
    expect(isOverdue({ start: '2026-11-04', done: false }, TODAY)).toBe(true)
    expect(isOverdue({ start: '2026-11-04', done: true }, TODAY)).toBe(false)
    expect(isOverdue({ start: TODAY, done: false }, TODAY)).toBe(false)
    // A range is only overdue once its last day has passed.
    expect(isOverdue({ start: '2026-11-03', end: TODAY, done: false }, TODAY)).toBe(false)
  })

  it('never marks an archived project', () => {
    const late = [{ start: '2026-11-01', done: false }] as Subtask[]
    expect(hasOverdue({ archived: false }, late, TODAY)).toBe(true)
    expect(hasOverdue({ archived: true }, late, TODAY)).toBe(false)
  })
})

describe('getProjectSpan', () => {
  it('runs from the earliest subtask to the publish date', () => {
    const span = getProjectSpan({ publishDate: '2026-11-14' }, [
      { start: '2026-11-04' },
      { start: '2026-11-02' },
      { start: '2026-11-14' },
    ])
    expect(span).toEqual({ start: '2026-11-02', end: '2026-11-14' })
  })
})

describe('shiftRange', () => {
  it('moves a day or a whole range, keeping its length', () => {
    expect(shiftRange({ start: '2026-11-05' }, 3)).toEqual({ start: '2026-11-08' })
    expect(shiftRange({ start: '2026-11-05', end: '2026-11-06' }, -5)).toEqual({
      start: '2026-10-31',
      end: '2026-11-01',
    })
  })
})

describe('colors', () => {
  it('picks the first free color, then repeats the least used', () => {
    expect(pickColor([])).toBe('blue')
    expect(pickColor(['blue', 'orange'])).toBe('green')
    expect(pickColor([...COLOR_IDS])).toBe('blue')
    expect(pickColor([...COLOR_IDS, 'blue'])).toBe('green')
  })

  it("only allows another active project's color once all are taken", () => {
    expect(isColorAvailable('green', ['blue'])).toBe(true)
    expect(isColorAvailable('blue', ['blue'])).toBe(false)
    expect(isColorAvailable('blue', [...COLOR_IDS])).toBe(true)
  })
})

describe('defaultTasks', () => {
  it('places one task per day, counting back from the publish date', () => {
    expect(defaultTasks('2026-11-14')).toEqual([
      { title: 'Script', start: '2026-11-09' },
      { title: 'A-roll', start: '2026-11-10' },
      { title: 'B-roll', start: '2026-11-11' },
      { title: 'Edit', start: '2026-11-12' },
      { title: 'Thumbnail', start: '2026-11-13' },
    ])
  })
})
