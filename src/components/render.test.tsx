import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { getTrackerData, type TrackerData } from '../data'
import { ARCHIVED_HEX } from '../lib/colors'
import { loadSampleData } from '../dev/sampleData'
import { MonthView } from './calendar/MonthView'
import { Sidebar } from './Sidebar'

// Renders the real components to HTML from the sample data, which is laid
// out like the spec's mockup when today is Thursday, Nov 5, 2026.
const TODAY = '2026-11-05'
let data: TrackerData
const NO_OPENERS = { onOpenProject: () => {}, onOpenSubtask: () => {}, onNotice: () => {} }

beforeAll(async () => {
  await loadSampleData(TODAY)
  data = await getTrackerData()
})

function render(element: React.ReactElement): string {
  return renderToStaticMarkup(element).replaceAll('<!-- -->', '')
}

function chipLabels(html: string, projectTitle: string): string[] {
  const pattern = new RegExp(`aria-label="${projectTitle}: ([^"]+)"`, 'g')
  return [...html.matchAll(pattern)].map((m) => m[1])
}

describe('MonthView', () => {
  const html = () => render(<MonthView data={data} today={TODAY} {...NO_OPENERS} />)

  it('shows the month with today marked', () => {
    expect(html()).toContain('November 2026')
    expect(html()).toContain('Today')
  })

  it('draws every subtask in the month as a chip', () => {
    expect(chipLabels(html(), 'Morning routine vlog')).toEqual([
      'Script, Nov 2, done',
      'A-roll, Nov 3, done',
      'B-roll, Nov 4, done',
      'Edit, Nov 5–6',
      'Thumbnail, Nov 11',
      'Publish, Nov 14',
    ])
    expect(html()).toContain('Edit · 2 days')
    expect(html()).toContain('Script ✓')
  })

  it('outlines overdue chips in red', () => {
    expect(html()).toMatch(
      /aria-label="Gym Reel: leg day: B-roll, Nov 4, overdue" class="[^"]*border-red-600/,
    )
    expect(html().match(/border-red-600/g)).toHaveLength(1)
  })

  it('draws archived projects in gray', () => {
    const chip = html().match(/aria-label="Coffee grinder review: Publish, Nov 1, done"[^>]*>/)
    expect(chip?.[0]).toContain(`border-color:${ARCHIVED_HEX}`)
  })
})

describe('Sidebar', () => {
  const html = () => render(<Sidebar data={data} today={TODAY} onOpenProject={() => {}} />)

  it('lists active projects by publish date with their progress', () => {
    const titles = ['Gym Reel: leg day', 'Morning routine vlog', 'Desk setup tour']
    const positions = titles.map((title) => html().indexOf(title))
    expect(positions.every((p) => p >= 0)).toBe(true)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
    expect(html()).toContain('Instagram · publish Nov 10')
    expect(html().match(/aria-valuenow="(\d+)"/g)).toEqual([
      'aria-valuenow="25"',
      'aria-valuenow="50"',
      'aria-valuenow="0"',
    ])
  })

  it('puts a red dot on projects with overdue subtasks only', () => {
    expect(html().match(/aria-label="Has overdue subtasks"/g)).toHaveLength(1)
  })

  it('keeps the archive collapsed with a count', () => {
    expect(html()).toContain('▸ Archive · 1 project')
    expect(html()).not.toContain('Coffee grinder review')
  })
})
