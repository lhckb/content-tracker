import { useLiveQuery } from 'dexie-react-hooks'
import { useSyncExternalStore } from 'react'
import { currentSpace, onSpaceChange, spaceDbName } from './db'
import type { Idea } from '../types'
import { getIdeas, getTrackerData, type TrackerData } from './queries'

const currentSpaceName = () => spaceDbName(currentSpace())

// Everything stored in the current space, re-read after every write and
// when the space changes (signing in or out). Undefined until the first
// read finishes.
export function useTrackerData(): TrackerData | undefined {
  const space = useSyncExternalStore(onSpaceChange, currentSpaceName, currentSpaceName)
  return useLiveQuery(getTrackerData, [space])
}

// The current space's ideas, kept up to date the same way.
export function useIdeas(): Idea[] | undefined {
  const space = useSyncExternalStore(onSpaceChange, currentSpaceName, currentSpaceName)
  return useLiveQuery(getIdeas, [space])
}
