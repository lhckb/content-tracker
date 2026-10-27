import type { DateRange } from '../types'
import { addDaysISO } from './dates'

// Moves a day or range by whole days, keeping its length.
export function shiftRange(range: DateRange, days: number): DateRange {
  const start = addDaysISO(range.start, days)
  return range.end === undefined
    ? { start }
    : { start, end: addDaysISO(range.end, days) }
}
