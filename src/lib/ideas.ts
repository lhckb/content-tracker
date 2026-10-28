import { format } from 'date-fns'
import type { ISODate, ISOMonth, Idea, Platform } from '../types'
import { parseISODate } from './dates'

// Grouping and ordering for the Ideas area, plus the month an idea is
// planned for ('YYYY-MM').

const ISO_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

export function isISOMonth(value: unknown): value is ISOMonth {
  return typeof value === 'string' && ISO_MONTH_PATTERN.test(value)
}

export function assertISOMonth(value: unknown): asserts value is ISOMonth {
  if (!isISOMonth(value)) throw new Error(`Not a valid YYYY-MM month: ${String(value)}`)
}

export function monthOfDay(day: ISODate): ISOMonth {
  return day.slice(0, 7)
}

// 'March 2027'
export function formatIdeaMonth(month: ISOMonth): string {
  return format(parseISODate(`${month}-01`), 'MMMM yyyy')
}

export interface IdeaGroup {
  // Null for the ideas with no month, which come last.
  month: ISOMonth | null
  // The month is before the current one.
  past: boolean
  ideas: Idea[]
}

// One platform's ideas under month headings: soonest month first (so months
// that have passed come first), then those with no month. Newest first
// within each group.
export function groupIdeas(ideas: Idea[], platform: Platform, today: ISODate): IdeaGroup[] {
  const thisMonth = monthOfDay(today)
  const byMonth = new Map<ISOMonth | null, Idea[]>()
  for (const idea of ideas) {
    if (idea.platform !== platform) continue
    const month = idea.month ?? null
    byMonth.set(month, [...(byMonth.get(month) ?? []), idea])
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => (a === b ? 0 : a === null ? 1 : b === null ? -1 : a < b ? -1 : 1))
    .map(([month, group]) => ({
      month,
      past: month !== null && month < thisMonth,
      ideas: group.sort(newestFirst),
    }))
}

function newestFirst(a: Idea, b: Idea): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1
  return a.id.localeCompare(b.id)
}

// 'January' … 'December', for the idea card's month list.
export const MONTH_NAMES: readonly string[] = Array.from({ length: 12 }, (_, i) =>
  format(new Date(2000, i, 1), 'MMMM'),
)

// 'YYYY-MM' for a month number (1–12) and year.
export function toISOMonth(year: number, month: number): ISOMonth {
  return `${year}-${String(month).padStart(2, '0')}`
}

// A month picked without a year: its next occurrence, counting this one.
export function nextOccurrence(month: number, today: ISODate): ISOMonth {
  const year = Number(today.slice(0, 4))
  return toISOMonth(month < Number(today.slice(5, 7)) ? year + 1 : year, month)
}

// The years the idea card offers: this year to three ahead, plus the idea's
// own year if it's outside that range.
export function yearOptions(today: ISODate, month?: ISOMonth): number[] {
  const thisYear = Number(today.slice(0, 4))
  const years = [thisYear, thisYear + 1, thisYear + 2, thisYear + 3]
  const own = month ? Number(month.slice(0, 4)) : undefined
  if (own !== undefined && !years.includes(own)) years.push(own)
  return years.sort((a, b) => a - b)
}
