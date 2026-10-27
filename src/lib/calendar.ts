import { addMonths, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from 'date-fns'
import type { ISODate } from '../types'
import { addDaysISO, parseISODate, toISODate } from './dates'

// Weeks run Sunday to Saturday.
const WEEK_OPTIONS = { weekStartsOn: 0 } as const

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Months are identified by their first day.
export function monthOf(date: ISODate): ISODate {
  return toISODate(startOfMonth(parseISODate(date)))
}

export function addMonthsISO(month: ISODate, months: number): ISODate {
  return toISODate(addMonths(parseISODate(month), months))
}

export function isSameMonth(a: ISODate, b: ISODate): boolean {
  return a.slice(0, 7) === b.slice(0, 7)
}

// 'November 2026'
export function formatMonth(month: ISODate): string {
  return format(parseISODate(month), 'MMMM yyyy')
}

export function dayOfMonth(date: ISODate): number {
  return Number(date.slice(8, 10))
}

// The Sunday that starts each row of `month`'s grid. The first and last rows
// include days from the neighbouring months.
export function weeksOfMonth(month: ISODate): ISODate[] {
  const first = toISODate(startOfWeek(startOfMonth(parseISODate(month)), WEEK_OPTIONS))
  const last = toISODate(endOfWeek(endOfMonth(parseISODate(month)), WEEK_OPTIONS))
  const weeks: ISODate[] = []
  for (let week = first; week <= last; week = addDaysISO(week, 7)) weeks.push(week)
  return weeks
}

export function daysOfWeek(weekStart: ISODate): ISODate[] {
  return Array.from({ length: 7 }, (_, i) => addDaysISO(weekStart, i))
}
