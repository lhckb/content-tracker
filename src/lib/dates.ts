import {
  addDays,
  differenceInCalendarDays,
  format,
  isValid,
  parseISO,
} from 'date-fns'
import type { ISODate } from '../types'

// 'YYYY-MM-DD' strings sort in date order, so the rest of the app compares
// them with plain < and >.

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function toISODate(date: Date): ISODate {
  return format(date, 'yyyy-MM-dd')
}

// Local midnight of the given day.
export function parseISODate(value: ISODate): Date {
  return parseISO(value)
}

export function todayISO(): ISODate {
  return toISODate(new Date())
}

export function isISODate(value: unknown): value is ISODate {
  if (typeof value !== 'string' || !ISO_DATE_PATTERN.test(value)) return false
  const date = parseISO(value)
  // The round trip rejects days that don't exist, such as 2026-02-30.
  return isValid(date) && toISODate(date) === value
}

export function assertISODate(value: unknown): asserts value is ISODate {
  if (!isISODate(value)) {
    throw new Error(`Not a valid YYYY-MM-DD date: ${String(value)}`)
  }
}

export function addDaysISO(value: ISODate, days: number): ISODate {
  return toISODate(addDays(parseISO(value), days))
}

// Every day from `start` to `end` (or just `start`), both inclusive.
export function daysInRange(start: ISODate, end: ISODate = start): ISODate[] {
  const days: ISODate[] = []
  for (let day = start; day <= end; day = addDaysISO(day, 1)) days.push(day)
  return days
}

// Whole days from `from` to `to`; negative when `to` is earlier.
export function daysBetween(from: ISODate, to: ISODate): number {
  return differenceInCalendarDays(parseISO(to), parseISO(from))
}

// A date someone could mean. Date inputs report every keystroke, so typing
// a year passes through 0002, 0020 and 0202 on the way to 2026.
export function isPlausibleDate(value: unknown): value is ISODate {
  if (!isISODate(value)) return false
  const year = Number(value.slice(0, 4))
  return year >= 1970 && year <= 2200
}

// 'Nov 14'
export function formatShortDate(value: ISODate): string {
  return format(parseISO(value), 'MMM d')
}

// 'Sat, Nov 14, 2026'
export function formatLongDate(value: ISODate): string {
  return format(parseISO(value), 'EEE, MMM d, yyyy')
}

// 'Nov 14'; a range is 'Nov 5–6' within a month, 'Oct 30 – Nov 2' across.
export function formatDateRange(start: ISODate, end?: ISODate): string {
  if (!end) return formatShortDate(start)
  if (start.slice(0, 7) === end.slice(0, 7)) {
    return `${formatShortDate(start)}–${format(parseISO(end), 'd')}`
  }
  return `${formatShortDate(start)} – ${formatShortDate(end)}`
}
