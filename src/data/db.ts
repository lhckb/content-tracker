import Dexie, { type EntityTable, type Transaction } from 'dexie'
import type { Idea, Project, Subtask } from '../types'

// Private to src/data. Screens go through the functions exported from
// src/data/index.ts.
//
// The device keeps one database per space: the guest space (signed out,
// this device only) and one per signed-in account, which is synced with the
// server (see sync.ts). Keeping them apart means signing out just deletes
// the account's database, and the two can never mix by accident.

export type Space = { kind: 'guest' } | { kind: 'account'; userId: string }

// A record changed in an account space that the server hasn't received yet.
export interface PendingChange {
  // `${table}:${id}`
  key: string
  table: SyncedTable
  id: string
  // When this device last changed the record; the server keeps the newest.
  editedAt: string
  // Set when the record was deleted: its last values, so the delete can be
  // sent as a complete tombstone row.
  deleted?: Project | Subtask | Idea
}

export type SyncedTable = 'projects' | 'subtasks' | 'ideas'

// Sync bookkeeping, such as how far this device has pulled.
export interface MetaEntry {
  key: string
  value: string
}

export type TrackerDb = Dexie & {
  projects: EntityTable<Project, 'id'>
  subtasks: EntityTable<Subtask, 'id'>
  ideas: EntityTable<Idea, 'id'>
  pending: EntityTable<PendingChange, 'key'>
  meta: EntityTable<MetaEntry, 'key'>
}

export const GUEST_DB_NAME = 'content-tracker'

export function spaceDbName(space: Space): string {
  return space.kind === 'guest' ? GUEST_DB_NAME : `content-tracker-account-${space.userId}`
}

function openSpaceDb(space: Space): TrackerDb {
  const database = new Dexie(spaceDbName(space)) as TrackerDb
  database.version(1).stores({ projects: 'id', subtasks: 'id, projectId' })
  database.version(2).stores({ pending: 'key' })
  database.version(3).stores({ meta: 'key' })
  database.version(4).stores({ ideas: 'id' })
  if (space.kind === 'account') recordChanges(database)
  return database
}

// The current space's database. Reassigned by switchSpace; modules that
// import it see the new one (ES modules export live bindings).
export let db = openSpaceDb({ kind: 'guest' })
let current: Space = { kind: 'guest' }
const listeners = new Set<() => void>()

export function currentSpace(): Space {
  return current
}

export function switchSpace(space: Space): void {
  if (spaceDbName(space) === spaceDbName(current)) return
  db.close()
  db = openSpaceDb(space)
  current = space
  for (const listener of listeners) listener()
}

export function onSpaceChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// Removes an account's copy from this device (signing out), switching back
// to the guest space first if it's the current one.
export async function deleteAccountSpace(userId: string): Promise<void> {
  const space: Space = { kind: 'account', userId }
  if (spaceDbName(current) === spaceDbName(space)) switchSpace({ kind: 'guest' })
  await Dexie.delete(spaceDbName(space))
}

// Every write runs in one of these, so the change recording below can add to
// the pending table in the same transaction.
export function writing<T>(fn: () => Promise<T>): Promise<T> {
  return db.transaction('rw', [db.projects, db.subtasks, db.ideas, db.pending, db.meta], fn)
}

// Transactions applying changes that came from the server, whose writes
// mustn't be recorded as local changes and sent back.
const remoteTransactions = new WeakSet<Transaction>()

export function applyingRemote<T>(fn: () => Promise<T>): Promise<T> {
  return writing(async () => {
    remoteTransactions.add(Dexie.currentTransaction)
    return fn()
  })
}

// In an account space, every create, update and delete of a project,
// subtask or idea also records a pending change, in the same transaction.
// Doing it in Dexie's hooks means no write path can forget to.
function recordChanges(database: TrackerDb): void {
  for (const table of ['projects', 'subtasks', 'ideas'] as const) {
    database[table].hook('creating', (id, _record, trans) => {
      record(trans, table, String(id))
    })
    database[table].hook('updating', (_changes, id, _record, trans) => {
      record(trans, table, String(id))
    })
    database[table].hook('deleting', (id, record_, trans) => {
      record(trans, table, String(id), record_)
    })
  }
}

function record(
  trans: Transaction,
  table: PendingChange['table'],
  id: string,
  deleted?: Project | Subtask | Idea,
): void {
  if (remoteTransactions.has(trans)) return
  const change: PendingChange = {
    key: `${table}:${id}`,
    table,
    id,
    editedAt: new Date().toISOString(),
    ...(deleted ? { deleted } : {}),
  }
  void trans.table('pending').put(change)
}

// Asks the browser not to clear this database when disk space runs low.
// Browsers may decline (Firefox asks the person); the app works either way.
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false
  } catch {
    return false
  }
}
