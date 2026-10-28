import { useState } from 'react'
import type { Tab } from '../components/TabBar'

// Which section is showing (the calendar, the project list or the ideas),
// remembered in this browser between visits.
const TAB_KEY = 'content-tracker:section'
const TABS: readonly Tab[] = ['calendar', 'projects', 'ideas']

export function useStoredTab() {
  const [tab, setTab] = useState<Tab>(() => {
    try {
      const stored = localStorage.getItem(TAB_KEY)
      return TABS.find((t) => t === stored) ?? 'calendar'
    } catch {
      return 'calendar'
    }
  })
  function update(next: Tab) {
    setTab(next)
    try {
      localStorage.setItem(TAB_KEY, next)
    } catch {
      // Storage blocked (e.g. private browsing): the choice lasts this visit.
    }
  }
  return [tab, update] as const
}
