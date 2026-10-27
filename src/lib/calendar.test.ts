import { describe, expect, it } from 'vitest'
import { addMonthsISO, formatMonth, monthOf, weeksOfMonth } from './calendar'

describe('weeksOfMonth', () => {
  it('starts every row on a Sunday and covers the whole month', () => {
    expect(weeksOfMonth('2026-11-01')).toEqual([
      '2026-11-01',
      '2026-11-08',
      '2026-11-15',
      '2026-11-22',
      '2026-11-29',
    ])
  })

  it('fills the first and last rows from the neighbouring months', () => {
    // Oct 1, 2026 is a Thursday.
    expect(weeksOfMonth('2026-10-01')[0]).toBe('2026-09-27')
    // Feb 2026 runs Sunday the 1st to Saturday the 28th: four rows.
    expect(weeksOfMonth('2026-02-01')).toHaveLength(4)
    // Aug 2026 starts on a Saturday and ends on a Monday: six rows.
    expect(weeksOfMonth('2026-08-01')).toHaveLength(6)
  })
})

describe('months', () => {
  it('navigates by first-of-month dates', () => {
    expect(monthOf('2026-11-14')).toBe('2026-11-01')
    expect(addMonthsISO('2026-11-01', 2)).toBe('2027-01-01')
    expect(addMonthsISO('2026-11-01', -11)).toBe('2025-12-01')
    expect(formatMonth('2026-11-01')).toBe('November 2026')
  })
})
