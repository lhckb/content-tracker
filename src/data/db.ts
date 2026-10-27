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
