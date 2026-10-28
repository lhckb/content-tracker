import {
  addIdea,
  addSubtask,
  archiveProject,
  clearAllData,
  createProject,
  getSubtasks,
  updateSubtask,
} from '../data'
import { addMonthsISO, monthOf } from '../lib/calendar'
import { addDaysISO, todayISO } from '../lib/dates'
import { monthOfDay } from '../lib/ideas'
import { isPublish } from '../lib/subtasks'
import type { Platform } from '../types'

interface SampleTask {
  title: string
  start: number
  end?: number
  done?: boolean
}

interface SampleProject {
  title: string
  platform: Platform
  // Day offsets from today.
  publishIn: number
  tasks: SampleTask[]
  cleanup?: SampleTask[]
  // Publish ticked and the project archived, or only ticked (wrapping up).
  published?: 'archived' | 'wrapping-up'
}

// Modeled on the spec's calendar mockup and placed around today, so done,
// overdue, multi-day, clean-up, wrapping-up and archived subtasks all show
// up whatever the date.
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
    cleanup: [{ title: 'Back up raw footage', start: 10 }],
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
    published: 'archived',
    tasks: [
      { title: 'Script', start: -12, done: true },
      { title: 'A-roll', start: -10, done: true },
      { title: 'Edit', start: -8, end: -6, done: true },
    ],
  },
  {
    title: 'Packing tips Reel',
    platform: 'instagram',
    publishIn: -3,
    published: 'wrapping-up',
    tasks: [
      { title: 'Script', start: -7, done: true },
      { title: 'Edit', start: -5, end: -4, done: true },
    ],
    cleanup: [
      { title: 'Share on Instagram Stories', start: -2, done: true },
      { title: 'Back up raw footage', start: -1 },
      { title: 'Reply to comments', start: 1, end: 2 },
    ],
  },
]

interface SampleIdea {
  title: string
  platform: Platform
  description: string
  // Months from this one; absent for no month.
  monthIn?: number
}

// Both columns, with a month that has passed, this month, later ones and no
// month.
const SAMPLE_IDEAS: SampleIdea[] = [
  {
    title: 'Studio lighting on a budget',
    platform: 'youtube',
    description: 'Three setups under $100, with before and after shots.',
    monthIn: 1,
  },
  { title: 'A week of meal prep', platform: 'youtube', description: '', monthIn: 3 },
  {
    title: 'What’s in my camera bag',
    platform: 'youtube',
    description: 'Only what I actually carry.\nCould be a Short as well.',
  },
  {
    title: 'Sunrise run timelapse',
    platform: 'instagram',
    description: 'Shoot from the bridge, facing east.',
    monthIn: -1,
  },
  { title: 'Desk makeover, before and after', platform: 'instagram', description: '', monthIn: 0 },
  {
    title: '5 stretches after leg day',
    platform: 'instagram',
    description: 'Carousel or Reel?',
  },
]

// Replaces everything stored with the sample projects and ideas.
export async function loadSampleData(today = todayISO()): Promise<void> {
  const day = (offset: number) => addDaysISO(today, offset)
  const month = (offset: number) => monthOfDay(addMonthsISO(monthOf(today), offset))
  await clearAllData()
  for (const idea of SAMPLE_IDEAS) {
    await addIdea({
      title: idea.title,
      platform: idea.platform,
      description: idea.description,
      month: idea.monthIn === undefined ? undefined : month(idea.monthIn),
    })
  }
  for (const sample of SAMPLES) {
    const projectId = await createProject({
      title: sample.title,
      platform: sample.platform,
      publishDate: day(sample.publishIn),
      withDefaultSubtasks: false,
    })
    const tasks = [
      ...sample.tasks.map((task) => ({ ...task, kind: 'task' as const })),
      ...(sample.cleanup ?? []).map((task) => ({ ...task, kind: 'cleanup' as const })),
    ]
    for (const task of tasks) {
      const result = await addSubtask(projectId, {
        title: task.title,
        start: day(task.start),
        end: task.end === undefined ? undefined : day(task.end),
        kind: task.kind,
      })
      if (!result.ok) throw new Error(`Sample task ${task.title} ends after publish`)
      if (task.done) await updateSubtask(result.id, { done: true })
    }
    if (sample.published) {
      const publish = (await getSubtasks(projectId)).find(isPublish)
      if (publish) await updateSubtask(publish.id, { done: true })
      if (sample.published === 'archived') await archiveProject(projectId)
    }
  }
}
