import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { getIdeas, getTrackerData, type TrackerData } from '../data'
import { ARCHIVED_HEX } from '../lib/colors'
import { loadSampleData } from '../dev/sampleData'
import type { Idea } from '../types'
import { CalendarView } from './calendar/CalendarView'
import { IdeasView } from './ideas/IdeasView'
import { Sidebar } from './Sidebar'

// Renders the real components to HTML from the sample data, which is laid
// out like the spec's mockup when today is Thursday, Nov 5, 2026.
const TODAY = '2026-11-05'
let data: TrackerData
let ideas: Idea[]
const NO_OPENERS = { onOpenProject: () => {}, onOpenSubtask: () => {}, onNotice: () => {} }

beforeAll(async () => {
  await loadSampleData(TODAY)
  data = await getTrackerData()
  ideas = await getIdeas()
})

function render(element: React.ReactElement): string {
  return renderToStaticMarkup(element).replaceAll('<!-- -->', '')
}

function chipLabels(html: string, projectTitle: string): string[] {
  const pattern = new RegExp(`aria-label="${projectTitle}: ([^"]+)"`, 'g')
  return [...html.matchAll(pattern)].map((m) => m[1])
}

// The opening tag of the chip with this label, whatever its attribute order.
function chipTag(html: string, label: string): string {
  const tag = html.match(new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`))
  if (!tag) throw new Error(`No chip labelled ${label}`)
  return tag[0]
}

describe('CalendarView', () => {
  const html = () => render(<CalendarView data={data} today={TODAY} {...NO_OPENERS} />)

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
      'Back up raw footage, Nov 15',
    ])
    expect(html()).toContain('Edit · 2 days')
    expect(html()).toContain('Script ✓')
  })

  it('outlines overdue chips in red', () => {
    expect(chipTag(html(), 'Gym Reel: leg day: B-roll, Nov 4, overdue')).toContain('border-red-600')
    expect(chipTag(html(), 'Packing tips Reel: Back up raw footage, Nov 4, overdue')).toContain('border-red-600')
    expect(html().match(/border-red-600/g)).toHaveLength(2)
  })

  it('draws archived projects in gray', () => {
    expect(chipTag(html(), 'Coffee grinder review: Publish, Nov 1, done')).toContain(
      `border-color:${ARCHIVED_HEX}`,
    )
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
      'aria-valuenow="100"',
      'aria-valuenow="25"',
      'aria-valuenow="50"',
      'aria-valuenow="0"',
    ])
  })

  it('puts a red dot on projects with overdue subtasks only', () => {
    expect(html().match(/aria-label="Has overdue subtasks"/g)).toHaveLength(2)
  })

  it('keeps the archive collapsed with a count', () => {
    expect(html()).toContain('▸ Archive · 1 project')
    expect(html()).not.toContain('Coffee grinder review')
  })
})

describe('IdeasView', () => {
  const html = () =>
    render(<IdeasView ideas={ideas} today={TODAY} onOpenIdea={() => {}} onMakeProject={() => {}} />)

  it('shows a column per platform with its count', () => {
    expect(html()).toContain('YouTube · 3')
    expect(html()).toContain('Instagram · 3')
  })

  it('groups each column by month, a past month first, no month last', () => {
    const headings = [...html().matchAll(/<h3[^>]*>(.*?)<\/h3>/g)].map((m) =>
      m[1].replace(/<[^>]+>/g, ''),
    )
    expect(headings).toEqual([
      'December 2026',
      'February 2027',
      'No month',
      'October 2026 · past',
      'November 2026',
      'No month',
    ])
  })

  it('stays off the calendar', () => {
    const calendar = render(<CalendarView data={data} today={TODAY} {...NO_OPENERS} />)
    expect(calendar).not.toContain('Sunrise run timelapse')
  })
})
