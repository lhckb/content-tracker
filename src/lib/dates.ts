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

// Whole days from `from` to `to`; negative when `to` is earlier.
export function daysBetween(from: ISODate, to: ISODate): number {
  return differenceInCalendarDays(parseISO(to), parseISO(from))
}

// 'Nov 14'
export function formatShortDate(value: ISODate): string {
  return format(parseISO(value), 'MMM d')
}

// 'Nov 14', or 'Nov 5 – Nov 6' for a range.
export function formatDateRange(start: ISODate, end?: ISODate): string {
  if (!end) return formatShortDate(start)
  return `${formatShortDate(start)} – ${formatShortDate(end)}`
}
