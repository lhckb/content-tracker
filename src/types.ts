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

// Every project has exactly one 'publish' subtask, sitting on its publish date.
export type SubtaskKind = 'task' | 'publish'

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
