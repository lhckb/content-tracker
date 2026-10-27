import Dexie, { type EntityTable } from 'dexie'
import type { Project, Subtask } from '../types'

// Private to src/data. Screens go through the functions exported from
// src/data/index.ts so this can be swapped for a sync backend later.
export const db = new Dexie('content-tracker') as Dexie & {
  projects: EntityTable<Project, 'id'>
  subtasks: EntityTable<Subtask, 'id'>
}

db.version(1).stores({
  projects: 'id',
  subtasks: 'id, projectId',
})

// Asks the browser not to clear this database when disk space runs low.
// Browsers may decline (Firefox asks the person); the app works either way.
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false
  } catch {
    return false
  }
}
