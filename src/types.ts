// Calendar days are stored as 'YYYY-MM-DD' strings with no time part.
// Parse them with parseISODate (date-fns parseISO), never `new Date(str)`,
// which reads them as UTC midnight and lands on the previous day west of UTC.
export type ISODate = string

export type Platform = 'youtube' | 'instagram'

export type ColorId =
  | 'blue'
  | 'green'
  | 'orange'
  | 'pink'
  | 'violet'
  | 'teal'
  | 'amber'
  | 'brown'

export interface Project {
  id: string
  title: string
  platform: Platform
  color: ColorId
  publishDate: ISODate
  notes: string
  archived: boolean
}

// Every project has exactly one 'publish' subtask, sitting on its publish
// date. 'cleanup' subtasks are the work after the video is out: they don't
// count toward progress, aren't ticked by Publish, and may fall after the
// publish date.
export type SubtaskKind = 'task' | 'publish' | 'cleanup'

export interface Subtask {
  id: string
  projectId: string
  kind: SubtaskKind
  title: string
  start: ISODate
  // Last day of a range, inclusive. Absent for a single-day subtask.
  end?: ISODate
  done: boolean
  notes: string
  order: number
}

export type DateRange = Pick<Subtask, 'start' | 'end'>

// A calendar month as 'YYYY-MM', with no day.
export type ISOMonth = string

// A video idea, kept apart from the calendar until it's made into a project.
export interface Idea {
  id: string
  title: string
  platform: Platform
  description: string
  // The month to work on it. Absent when not set.
  month?: ISOMonth
  // When it was added (an ISO time), for ordering within a month.
  createdAt: string
}
