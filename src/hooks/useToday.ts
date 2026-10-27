import { useEffect, useState } from 'react'
import { todayISO } from '../lib/dates'
import type { ISODate } from '../types'

// Today's date, kept current past midnight and after the computer wakes up.
export function useToday(): ISODate {
  const [today, setToday] = useState(todayISO)

  useEffect(() => {
    const refresh = () => setToday(todayISO())
    const now = new Date()
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    const timer = setTimeout(refresh, nextMidnight.getTime() - now.getTime() + 1000)
    window.addEventListener('focus', refresh)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [today])

  return today
}
