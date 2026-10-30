import { describe, expect, it } from 'vitest'
import {
  addDaysISO,
  daysInRange,
  daysBetween,
  formatClock,
  formatDateRange,
  isISODate,
  isPlausibleDate,
  parseISODate,
  toISODate,
} from './dates'

describe('dates', () => {
  it('runs the tests west of UTC, where UTC parsing would slip a day', () => {
    expect(new Date(2026, 10, 1).getTimezoneOffset()).toBeGreaterThan(0)
    expect(parseISODate('2026-11-01').getDate()).toBe(1)
    expect(toISODate(parseISODate('2026-11-01'))).toBe('2026-11-01')
  })

  it('accepts real days only', () => {
    expect(isISODate('2026-11-14')).toBe(true)
    expect(isISODate('2028-02-29')).toBe(true)
    expect(isISODate('2026-02-30')).toBe(false)
    expect(isISODate('2026-11-14T00:00')).toBe(false)
    expect(isISODate('11/14/2026')).toBe(false)
    expect(isISODate(20261114)).toBe(false)
  })

  it('adds days across month ends and the daylight-saving change', () => {
    expect(addDaysISO('2026-10-30', 3)).toBe('2026-11-02')
    // US clocks fall back on 2026-11-01.
    expect(addDaysISO('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDaysISO('2026-11-01', 1)).toBe('2026-11-02')
    expect(addDaysISO('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('lists the days of a range', () => {
    expect(daysInRange('2026-10-30', '2026-11-02')).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ])
    expect(daysInRange('2026-11-05')).toEqual(['2026-11-05'])
  })

  it('counts whole days between dates', () => {
    expect(daysBetween('2026-10-30', '2026-11-02')).toBe(3)
    expect(daysBetween('2026-11-02', '2026-10-30')).toBe(-3)
  })

  it('formats a day or a range', () => {
    expect(formatDateRange('2026-11-14')).toBe('Nov 14')
    expect(formatDateRange('2026-11-05', '2026-11-06')).toBe('Nov 5–6')
    expect(formatDateRange('2026-10-30', '2026-11-02')).toBe('Oct 30 – Nov 2')
  })

  it('formats a time of day', () => {
    expect(formatClock('08:00')).toBe('8:00 AM')
    expect(formatClock('00:05')).toBe('12:05 AM')
    expect(formatClock('12:00')).toBe('12:00 PM')
    expect(formatClock('18:30')).toBe('6:30 PM')
  })

  it('skips the half-typed years a date input reports along the way', () => {
    expect(isPlausibleDate('0002-11-14')).toBe(false)
    expect(isPlausibleDate('0202-11-14')).toBe(false)
    expect(isPlausibleDate('2026-11-14')).toBe(true)
  })
})
