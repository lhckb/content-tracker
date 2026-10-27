import { liveQuery } from 'dexie'
import { useSyncExternalStore } from 'react'
import { findRepairs } from '../lib/repairs'
import type { Project, Subtask } from '../types'
import { applyingRemote, db, writing } from './db'
import { getTrackerData } from './queries'
import {
  projectToRow,
  rowToProject,
  rowToSubtask,
  subtaskToRow,
  type Rows,
  type SyncServer,
} from './remote'

// Keeps the signed-in account's local database and the server in step.
// The app only ever reads and writes the local database; this sends its
// pending changes up and brings other devices' changes down.

export type SyncStatus =
  | { state: 'off' }
  | { state: 'syncing' }
  | { state: 'synced'; at: string }
  | { state: 'offline' }
  | { state: 'error'; message: string }

let status: SyncStatus = { state: 'off' }
const statusListeners = new Set<() => void>()

function setStatus(next: SyncStatus): void {
  status = next
  for (const listener of statusListeners) listener()
}

export function getSyncStatus(): SyncStatus {
  return status
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (onChange) => {
      statusListeners.add(onChange)
      return () => statusListeners.delete(onChange)
    },
    getSyncStatus,
    getSyncStatus,
  )
}

// Changes this device has made that the server hasn't received yet.
export function countPendingChanges(): Promise<number> {
  return db.pending.count()
}

export interface SyncEngine {
  // Runs a push and pull now (or waits for the one in progress, then runs
  // another so nothing is missed).
  syncNow(): Promise<void>
  stop(): void
}

export interface SyncOptions {
  // How long to wait after a local change before pushing, so a burst of
  // edits goes up together.
  debounceMs?: number
  // A fallback pull, in case a live update was missed.
  pollMs?: number
  retryMs?: number
}

const PULLED_UNTIL = 'pulledUntil'

// Rows committed just before the last pull can carry an earlier
// updated_at than rows already pulled, so each pull reaches back this far.
// Applying a row twice is harmless.
const PULL_OVERLAP_MS = 2 * 60_000

export function startSync(
  server: SyncServer,
  { debounceMs = 800, pollMs = 5 * 60_000, retryMs = 30_000 }: SyncOptions = {},
): SyncEngine {
  let stopped = false
  let running: Promise<void> | null = null
  let again = false
  let timer: ReturnType<typeof setTimeout> | undefined

  const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false

  function syncNow(): Promise<void> {
    if (stopped) return Promise.resolve()
    if (running) {
      again = true
      return running
    }
    running = (async () => {
      do {
        again = false
        if (isOffline()) {
          setStatus({ state: 'offline' })
          return
        }
        setStatus({ state: 'syncing' })
        try {
          await push(server)
          await pull(server)
          if (!stopped) setStatus({ state: 'synced', at: new Date().toISOString() })
        } catch (error) {
          if (stopped) return
          setStatus(
            isOffline()
              ? { state: 'offline' }
              : { state: 'error', message: error instanceof Error ? error.message : String(error) },
          )
          schedule(retryMs)
          return
        }
      } while (again && !stopped)
    })().finally(() => {
      running = null
    })
    return running
  }

  function schedule(ms: number): void {
    if (stopped) return
    clearTimeout(timer)
    timer = setTimeout(() => void syncNow(), ms)
  }

  // Local changes: push shortly after the pending list grows.
  const pendingWatch = liveQuery(() => db.pending.count()).subscribe((count) => {
    if (count > 0) schedule(debounceMs)
  })
  // Other devices' changes, announced live by the server.
  const unsubscribe = server.subscribe(() => schedule(200))
  const poll = setInterval(() => void syncNow(), pollMs)
  const onWake = () => {
    if (typeof document === 'undefined' || document.visibilityState === 'visible') void syncNow()
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('online', onWake)
    window.addEventListener('focus', onWake)
    document.addEventListener('visibilitychange', onWake)
  }

  void syncNow()

  return {
    syncNow,
    stop() {
      stopped = true
      clearTimeout(timer)
      clearInterval(poll)
      pendingWatch.unsubscribe()
      unsubscribe()
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', onWake)
        window.removeEventListener('focus', onWake)
        document.removeEventListener('visibilitychange', onWake)
      }
      setStatus({ state: 'off' })
    },
  }
}

// Sends every pending change, then forgets the ones that didn't change
// again while the push was in flight.
async function push(server: SyncServer): Promise<void> {
  const { pending, rows } = await db.transaction(
    'r',
    [db.projects, db.subtasks, db.pending],
    async () => {
      const pending = await db.pending.toArray()
      const rows: Rows = { projects: [], subtasks: [] }
      for (const change of pending) {
        const record = change.deleted ?? (await db.table(change.table).get(change.id))
        if (!record) continue
        const deleted = change.deleted !== undefined
        if (change.table === 'projects') {
          rows.projects.push(projectToRow(record as Project, change.editedAt, deleted))
        } else {
          rows.subtasks.push(subtaskToRow(record as Subtask, change.editedAt, deleted))
        }
      }
      return { pending, rows }
    },
  )
  if (pending.length === 0) return
  await server.push(rows)
  await writing(async () => {
    for (const sent of pending) {
      const now = await db.pending.get(sent.key)
      if (now?.editedAt === sent.editedAt) await db.pending.delete(sent.key)
    }
  })
}

// Brings down what changed on the server since the last pull. A record with
// a change still waiting to go up keeps its local version; the push decides
// which edit wins, and the next pull brings the result.
async function pull(server: SyncServer): Promise<void> {
  const pulledUntil = (await db.meta.get(PULLED_UNTIL))?.value
  const since = pulledUntil
    ? new Date(Date.parse(pulledUntil) - PULL_OVERLAP_MS).toISOString()
    : null
  const rows = await server.pull(since)
  if (rows.projects.length === 0 && rows.subtasks.length === 0) return

  await applyingRemote(async () => {
    const waiting = new Set(await db.pending.toCollection().primaryKeys())
    for (const row of rows.projects) {
      if (waiting.has(`projects:${row.id}`)) continue
      if (row.deleted) await db.projects.delete(row.id)
      else await db.projects.put(rowToProject(row))
    }
    for (const row of rows.subtasks) {
      if (waiting.has(`subtasks:${row.id}`)) continue
      if (row.deleted) await db.subtasks.delete(row.id)
      else await db.subtasks.put(rowToSubtask(row))
    }
    let newest = pulledUntil ?? ''
    for (const { updated_at } of [...rows.projects, ...rows.subtasks]) {
      if (updated_at && (!newest || Date.parse(updated_at) > Date.parse(newest))) newest = updated_at
    }
    if (newest) await db.meta.put({ key: PULLED_UNTIL, value: newest })
  })

  await repair()
}

// Fixes what two devices' edits can leave behind (see lib/repairs.ts). The
// fixes are ordinary local changes, so they're recorded and pushed too.
async function repair(): Promise<void> {
  const { projects, subtasks } = await getTrackerData()
  const { publishDates, colors } = findRepairs(projects, subtasks)
  if (publishDates.length === 0 && colors.length === 0) return
  await writing(async () => {
    for (const { subtaskId, date } of publishDates) {
      await db.subtasks.update(subtaskId, { start: date, end: undefined })
    }
    for (const { projectId, color } of colors) {
      await db.projects.update(projectId, { color })
    }
  })
}
