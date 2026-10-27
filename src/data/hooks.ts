import { useLiveQuery } from 'dexie-react-hooks'
import { getTrackerData, type TrackerData } from './queries'

// Everything stored, re-read after every write. Undefined until the first
// read finishes.
export function useTrackerData(): TrackerData | undefined {
  return useLiveQuery(getTrackerData)
}
