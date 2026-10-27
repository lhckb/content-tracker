import type { ISODate } from '../types'
import { addDaysISO } from './dates'

export const PUBLISH_TITLE = 'Publish'

export const DEFAULT_TASK_TITLES = ['Script', 'A-roll', 'B-roll', 'Edit', 'Thumbnail']

// Placeholder days for the default tasks, one per day counting back from the
// publish date (Thumbnail the day before, Script five days before), so a new
// project shows up on the calendar ready to be dragged into place.
export function defaultTasks(publishDate: ISODate): { title: string; start: ISODate }[] {
  const count = DEFAULT_TASK_TITLES.length
  return DEFAULT_TASK_TITLES.map((title, i) => ({
    title,
    start: addDaysISO(publishDate, i - count),
  }))
}
