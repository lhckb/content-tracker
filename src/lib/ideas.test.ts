import { describe, expect, it } from 'vitest'
import type { Idea } from '../types'
import { formatIdeaMonth, groupIdeas, isISOMonth, MONTH_NAMES, nextOccurrence, yearOptions } from './ideas'
import { projectsAndIdeas } from './plural'

let next = 0
function idea(fields: Partial<Idea>): Idea {
  next += 1
  return {
    id: `idea-${next}`,
    title: `Idea ${next}`,
    platform: 'youtube',
    description: '',
    createdAt: '2026-10-28T10:00:00.000Z',
    ...fields,
  }
}

const TODAY = '2026-11-05'

describe('groupIdeas', () => {
  it('groups by month, soonest first, past months marked, no month last', () => {
    const ideas = [
      idea({ title: 'none' }),
      idea({ title: 'march', month: '2027-03' }),
      idea({ title: 'september', month: '2026-09' }),
      idea({ title: 'november', month: '2026-11' }),
      idea({ title: 'december', month: '2026-12' }),
    ]
    const groups = groupIdeas(ideas, 'youtube', TODAY)
    expect(groups.map((g) => [g.month, g.past])).toEqual([
      ['2026-09', true],
      ['2026-11', false],
      ['2026-12', false],
      ['2027-03', false],
      [null, false],
    ])
  })

  it('shows only the given platform', () => {
    const ideas = [idea({ title: 'yt' }), idea({ title: 'ig', platform: 'instagram' })]
    expect(groupIdeas(ideas, 'instagram', TODAY).flatMap((g) => g.ideas.map((i) => i.title))).toEqual(['ig'])
    expect(groupIdeas([], 'youtube', TODAY)).toEqual([])
  })

  it('puts the newest first within a month', () => {
    const ideas = [
      idea({ title: 'older', month: '2026-12', createdAt: '2026-10-01T09:00:00.000Z' }),
      idea({ title: 'newer', month: '2026-12', createdAt: '2026-10-20T09:00:00.000Z' }),
    ]
    expect(groupIdeas(ideas, 'youtube', TODAY)[0].ideas.map((i) => i.title)).toEqual(['newer', 'older'])
  })
})

describe('months', () => {
  it('accepts only YYYY-MM', () => {
    expect(isISOMonth('2027-03')).toBe(true)
    for (const bad of ['2027-3', '2027-13', '2027-00', 'March 2027', '2027-03-01', 202703]) {
      expect(isISOMonth(bad)).toBe(false)
    }
  })

  it('formats a month for headings', () => {
    expect(formatIdeaMonth('2027-03')).toBe('March 2027')
  })

  it('picks the next occurrence of a month chosen without a year', () => {
    expect(nextOccurrence(11, TODAY)).toBe('2026-11')
    expect(nextOccurrence(12, TODAY)).toBe('2026-12')
    expect(nextOccurrence(3, TODAY)).toBe('2027-03')
    expect(MONTH_NAMES[2]).toBe('March')
  })

  it('offers this year to three ahead, plus the idea’s own year', () => {
    expect(yearOptions(TODAY)).toEqual([2026, 2027, 2028, 2029])
    expect(yearOptions(TODAY, '2031-01')).toEqual([2026, 2027, 2028, 2029, 2031])
    expect(yearOptions(TODAY, '2025-06')).toEqual([2025, 2026, 2027, 2028, 2029])
  })
})

describe('projectsAndIdeas', () => {
  it('names what there is', () => {
    expect(projectsAndIdeas({ projects: 2, ideas: 3 })).toBe('2 projects and 3 ideas')
    expect(projectsAndIdeas({ projects: 1, ideas: 0 })).toBe('1 project')
    expect(projectsAndIdeas({ projects: 0, ideas: 1 })).toBe('1 idea')
    expect(projectsAndIdeas({ projects: 0, ideas: 0 })).toBe('0 projects')
  })
})
