import {
  addSubtask,
  archiveProject,
  clearAllData,
  createProject,
  getSubtasks,
  updateSubtask,
} from '../data'
import { addDaysISO, todayISO } from '../lib/dates'
import { isPublish } from '../lib/subtasks'
import type { Platform } from '../types'

interface SampleProject {
  title: string
  platform: Platform
  // Day offsets from today.
  publishIn: number
  tasks: { title: string; start: number; end?: number; done?: boolean }[]
  published?: boolean
}

// Modeled on the spec's calendar mockup and placed around today, so done,
// overdue, multi-day and archived subtasks all show up whatever the date.
const SAMPLES: SampleProject[] = [
  {
    title: 'Morning routine vlog',
    platform: 'youtube',
    publishIn: 9,
    tasks: [
      { title: 'Script', start: -3, done: true },
      { title: 'A-roll', start: -2, done: true },
      { title: 'B-roll', start: -1, done: true },
      { title: 'Edit', start: 0, end: 1 },
      { title: 'Thumbnail', start: 6 },
    ],
  },
  {
    title: 'Gym Reel: leg day',
    platform: 'instagram',
    publishIn: 5,
    tasks: [
      { title: 'Script', start: -2, done: true },
      { title: 'B-roll', start: -1 },
      { title: 'Edit', start: 2 },
    ],
  },
  {
    title: 'Desk setup tour',
    platform: 'youtube',
    publishIn: 16,
    tasks: [
      { title: 'Script', start: 7 },
      { title: 'A-roll', start: 8 },
    ],
  },
  {
    title: 'Coffee grinder review',
    platform: 'youtube',
    publishIn: -4,
    published: true,
    tasks: [
      { title: 'Script', start: -12, done: true },
      { title: 'A-roll', start: -10, done: true },
      { title: 'Edit', start: -8, end: -6, done: true },
    ],
  },
]

// Replaces everything stored with the sample projects.
export async function loadSampleData(today = todayISO()): Promise<void> {
  const day = (offset: number) => addDaysISO(today, offset)
  await clearAllData()
  for (const sample of SAMPLES) {
    const projectId = await createProject({
      title: sample.title,
      platform: sample.platform,
      publishDate: day(sample.publishIn),
      withDefaultSubtasks: false,
    })
    for (const task of sample.tasks) {
      const result = await addSubtask(projectId, {
        title: task.title,
        start: day(task.start),
        end: task.end === undefined ? undefined : day(task.end),
      })
      if (!result.ok) throw new Error(`Sample task ${task.title} ends after publish`)
      if (task.done) await updateSubtask(result.id, { done: true })
    }
    if (sample.published) {
      const publish = (await getSubtasks(projectId)).find(isPublish)
      if (publish) await updateSubtask(publish.id, { done: true })
      await archiveProject(projectId)
    }
  }
}
