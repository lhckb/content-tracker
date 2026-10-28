import { describe, expect, it } from 'vitest'
import { getIdeas, getTrackerData } from '../data'
import { groupIdeas } from '../lib/ideas'
import { hasOverdue } from '../lib/overdue'
import { getProgress } from '../lib/progress'
import { loadSampleData } from './sampleData'

describe('loadSampleData', () => {
  it('matches the mockup: three active projects, one archived, one overdue', async () => {
    const today = '2026-11-05'
    await loadSampleData(today)
    const { projects, subtasks } = await getTrackerData()
    // Stored order follows the random ids, so sort for a stable comparison.
    projects.sort((a, b) => a.publishDate.localeCompare(b.publishDate))
    const summary = projects.map((project) => {
      const own = subtasks.filter((s) => s.projectId === project.id)
      return {
        title: project.title,
        color: project.color,
        archived: project.archived,
        percent: getProgress(own).percent,
        overdue: hasOverdue(project, own, today),
      }
    })
    expect(summary).toEqual([
      { title: 'Coffee grinder review', color: 'pink', archived: true, percent: 100, overdue: false },
      { title: 'Gym Reel: leg day', color: 'green', archived: false, percent: 25, overdue: true },
      { title: 'Morning routine vlog', color: 'blue', archived: false, percent: 50, overdue: false },
      { title: 'Desk setup tour', color: 'orange', archived: false, percent: 0, overdue: false },
    ])
  })

  it('adds ideas to both columns, with a past month, later months and none', async () => {
    const today = '2026-11-05'
    await loadSampleData(today)
    const ideas = await getIdeas()
    const months = (platform: 'youtube' | 'instagram') =>
      groupIdeas(ideas, platform, today).map((g) => (g.past ? `${g.month} past` : g.month))
    expect(months('youtube')).toEqual(['2026-12', '2027-02', null])
    expect(months('instagram')).toEqual(['2026-10 past', '2026-11', null])
  })
})
