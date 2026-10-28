import { describe, expect, it } from 'vitest'
import type { Project, Subtask } from '../types'
import { layoutWeek, segmentAt, type Lane, type ProjectWithSubtasks } from './lanes'

type Task = [title: string, start: string, end?: string]

function project(
  id: string,
  publishDate: string,
  tasks: Task[],
  archived = false,
): ProjectWithSubtasks {
  const p: Project = {
    id,
    title: id,
    platform: 'youtube',
    color: 'blue',
    publishDate,
    notes: '',
    archived,
  }
  const subtasks: Subtask[] = tasks.map(([title, start, end], order) => ({
    id: `${id}-${title}`,
    projectId: id,
    kind: 'task',
    title,
    start,
    ...(end ? { end } : {}),
    done: false,
    notes: '',
    order,
  }))
  subtasks.push({
    id: `${id}-Publish`,
    projectId: id,
    kind: 'publish',
    title: 'Publish',
    start: publishDate,
    done: false,
    notes: '',
    order: tasks.length,
  })
  return { project: p, subtasks }
}

// The spec's calendar mockup: November 2026, with Nov 1 on a Sunday.
const coffee = project('coffee', '2026-11-01', [['Script', '2026-10-24']], true)
const morning = project('morning', '2026-11-14', [
  ['Script', '2026-11-02'],
  ['A-roll', '2026-11-03'],
  ['B-roll', '2026-11-04'],
  ['Edit', '2026-11-05', '2026-11-06'],
  ['Thumbnail', '2026-11-11'],
])
const gym = project('gym', '2026-11-10', [
  ['Script', '2026-11-03'],
  ['B-roll', '2026-11-04'],
  ['Edit', '2026-11-07'],
])
const desk = project('desk', '2026-11-21', [
  ['Script', '2026-11-12'],
  ['A-roll', '2026-11-13'],
])
// Deliberately out of order: the layout must not depend on input order.
const MOCKUP = [desk, gym, morning, coffee]

function bands(lanes: Lane[]) {
  return lanes.map((lane) => lane.segments.map((s) => `${s.project.id} ${s.startCol}-${s.endCol}`))
}

function chips(lane: Lane) {
  return lane.segments.flatMap((s) =>
    s.chips.map((c) => `${c.subtask.title} ${c.startCol}-${c.endCol} r${c.row}`),
  )
}

describe('layoutWeek', () => {
  it('stacks overlapping projects and lets the rest share a lane, as in the mockup', () => {
    expect(bands(layoutWeek('2026-11-01', MOCKUP))).toEqual([
      ['coffee 0-0', 'morning 1-6'],
      ['gym 2-6'],
    ])
    expect(bands(layoutWeek('2026-11-08', MOCKUP))).toEqual([
      ['morning 0-6'],
      ['gym 0-2', 'desk 4-6'],
    ])
    expect(bands(layoutWeek('2026-11-22', MOCKUP))).toEqual([])
  })

  it('marks bands that carry on across week rows', () => {
    const week1 = layoutWeek('2026-11-01', [morning])[0].segments[0]
    const week2 = layoutWeek('2026-11-08', [morning])[0].segments[0]
    expect(week1).toMatchObject({ continuesBefore: false, continuesAfter: true })
    expect(week2).toMatchObject({ continuesBefore: true, continuesAfter: false })
  })

  it('puts each chip on its days, stretching ranges', () => {
    const [lane] = layoutWeek('2026-11-01', [morning])
    expect(chips(lane)).toEqual(['Script 1-1 r0', 'A-roll 2-2 r0', 'B-roll 3-3 r0', 'Edit 4-5 r0'])
    expect(lane.rowCount).toBe(1)
  })

  it('moves chips that share a day onto extra rows', () => {
    const busy = project('busy', '2026-11-14', [
      ['Edit', '2026-11-04', '2026-11-06'],
      ['Color', '2026-11-05'],
      ['Music', '2026-11-06'],
      ['Thumbnail', '2026-11-07'],
    ])
    const [lane] = layoutWeek('2026-11-01', [busy])
    expect(chips(lane)).toEqual(['Edit 3-5 r0', 'Color 4-4 r1', 'Music 5-5 r1', 'Thumbnail 6-6 r0'])
    expect(lane.rowCount).toBe(2)
  })

  it('finds the band and the tasks on a given day, including days with no task', () => {
    const [lane] = layoutWeek('2026-11-08', [morning])
    // Nov 9: inside the band, no task.
    expect(segmentAt(lane, 1)).toMatchObject({ segment: { project: { id: 'morning' } }, chips: [] })
    // Nov 11: Thumbnail.
    expect(segmentAt(lane, 3)?.chips.map((c) => c.subtask.title)).toEqual(['Thumbnail'])
    // Week of Nov 15: after the publish date, no band at all.
    expect(layoutWeek('2026-11-15', [morning])).toEqual([])
  })

  it('splits a range that crosses into the next week', () => {
    const p = project('p', '2026-11-14', [['Edit', '2026-11-06', '2026-11-09']])
    const [week1] = layoutWeek('2026-11-01', [p])[0].segments[0].chips
    const [week2] = layoutWeek('2026-11-08', [p])[0].segments[0].chips
    expect(week1).toMatchObject({ startCol: 5, endCol: 6, continuesAfter: true })
    expect(week2).toMatchObject({ startCol: 0, endCol: 1, continuesBefore: true })
  })
})

describe('the band after Publish', () => {
  // Publish on Thursday Nov 12; clean-up on Nov 13 and Nov 16–17.
  function wrapping(): ProjectWithSubtasks {
    const item = project('wrap', '2026-11-12', [['Edit', '2026-11-10']])
    for (const [title, start, end] of [
      ['Backup', '2026-11-13'],
      ['Stories', '2026-11-16', '2026-11-17'],
    ]) {
      item.subtasks.push({
        id: `wrap-${title}`,
        projectId: 'wrap',
        kind: 'cleanup',
        title,
        start,
        ...(end ? { end } : {}),
        done: false,
        notes: '',
        order: 9,
      })
    }
    return item
  }

  it('carries on, lighter, to the last clean-up task', () => {
    const [lane] = layoutWeek('2026-11-08', [wrapping()])
    const segment = lane.segments[0]
    expect([segment.startCol, segment.endCol, segment.continuesAfter]).toEqual([2, 6, true])
    expect(segment.main).toMatchObject({ startCol: 2, endCol: 4, continuesBefore: false, continuesAfter: true })
    expect(segment.tail).toMatchObject({ startCol: 5, endCol: 6, continuesBefore: true, continuesAfter: true })

    const [next] = layoutWeek('2026-11-15', [wrapping()])
    expect(next.segments[0].main).toBeNull()
    expect(next.segments[0].tail).toMatchObject({ startCol: 0, endCol: 2, continuesBefore: true, continuesAfter: false })
  })

  it('keeps the lighter part clear of other projects', () => {
    const other = project('other', '2026-11-20', [['Script', '2026-11-16']])
    const lanes = layoutWeek('2026-11-15', [wrapping(), other])
    expect(lanes).toHaveLength(2)
  })

  it('has no lighter part without clean-up tasks after Publish', () => {
    const [lane] = layoutWeek('2026-11-08', [project('plain', '2026-11-12', [['Edit', '2026-11-10']])])
    expect(lane.segments[0].tail).toBeNull()
    expect(lane.segments[0].main).toMatchObject({ endCol: 4, continuesAfter: false })
  })
})
