import { isColorId } from '../lib/colors'
import { isISODate, todayISO } from '../lib/dates'
import { PLATFORMS } from '../lib/platforms'
import type { Project, Subtask, SubtaskKind } from '../types'
import { db } from './db'
import { getTrackerData } from './queries'

const APP_ID = 'content-tracker'

// Bump when the stored shape changes, and teach parseBackup to upgrade
// files written by older versions.
export const BACKUP_SCHEMA_VERSION = 1

export interface Backup {
  app: typeof APP_ID
  schemaVersion: typeof BACKUP_SCHEMA_VERSION
  exportedAt: string
  projects: Project[]
  subtasks: Subtask[]
}

// Thrown when an imported file can't be used. The message is meant to be
// shown to the user as-is.
export class BackupError extends Error {
  name = 'BackupError'
}

export function backupFileName(date = todayISO()): string {
  return `content-tracker-backup-${date}.json`
}

export async function exportBackupText(): Promise<string> {
  const { projects, subtasks } = await getTrackerData()
  const backup: Backup = {
    app: APP_ID,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    projects,
    subtasks,
  }
  return JSON.stringify(backup, null, 2)
}

// Replaces everything stored with the backup's contents. Nothing changes if
// the file is rejected.
export async function importBackupText(
  text: string,
): Promise<{ projects: number; subtasks: number }> {
  const backup = parseBackup(text)
  await db.transaction('rw', db.projects, db.subtasks, async () => {
    await db.projects.clear()
    await db.subtasks.clear()
    await db.projects.bulkAdd(backup.projects)
    await db.subtasks.bulkAdd(backup.subtasks)
  })
  return { projects: backup.projects.length, subtasks: backup.subtasks.length }
}

export async function clearAllData(): Promise<void> {
  await db.transaction('rw', db.projects, db.subtasks, async () => {
    await db.projects.clear()
    await db.subtasks.clear()
  })
}

// Checks an untrusted file field by field and keeps only known fields.
export function parseBackup(text: string): Backup {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new BackupError("This file isn't valid JSON.")
  }
  if (!isRecord(data) || data.app !== APP_ID) {
    throw new BackupError("This file isn't a Content Tracker backup.")
  }
  if (data.schemaVersion !== BACKUP_SCHEMA_VERSION) {
    throw new BackupError(
      `This backup uses format version ${String(data.schemaVersion)}, which this version of the app can't read.`,
    )
  }
  const { projects: rawProjects, subtasks: rawSubtasks, exportedAt } = data
  if (!Array.isArray(rawProjects)) damaged('no project list')
  if (!Array.isArray(rawSubtasks)) damaged('no subtask list')
  const projects = rawProjects.map(parseProject)
  const subtasks = rawSubtasks.map(parseSubtask)
  checkConsistency(projects, subtasks)
  return {
    app: APP_ID,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: typeof exportedAt === 'string' ? exportedAt : '',
    projects,
    subtasks,
  }
}

const SUBTASK_KINDS: readonly SubtaskKind[] = ['task', 'publish']

function parseProject(value: unknown, index: number): Project {
  const where = `project ${index + 1}`
  if (!isRecord(value)) damaged(where)
  const { id, title, platform, color, publishDate, notes, archived } = value
  if (typeof id !== 'string' || !id) damaged(`${where}: id`)
  if (typeof title !== 'string') damaged(`${where}: title`)
  if (!isOneOf(platform, PLATFORMS)) damaged(`${where}: platform`)
  if (!isColorId(color)) damaged(`${where}: color`)
  if (!isISODate(publishDate)) damaged(`${where}: publish date`)
  if (typeof notes !== 'string') damaged(`${where}: notes`)
  if (typeof archived !== 'boolean') damaged(`${where}: archived`)
  return { id, title, platform, color, publishDate, notes, archived }
}

function parseSubtask(value: unknown, index: number): Subtask {
  const where = `subtask ${index + 1}`
  if (!isRecord(value)) damaged(where)
  const { id, projectId, kind, title, start, end, done, notes, order } = value
  if (typeof id !== 'string' || !id) damaged(`${where}: id`)
  if (typeof projectId !== 'string') damaged(`${where}: project id`)
  if (!isOneOf(kind, SUBTASK_KINDS)) damaged(`${where}: kind`)
  if (typeof title !== 'string') damaged(`${where}: title`)
  if (!isISODate(start)) damaged(`${where}: start date`)
  if (end !== undefined && !isISODate(end)) damaged(`${where}: end date`)
  if (end !== undefined && end < start) damaged(`${where}: ends before it starts`)
  if (typeof done !== 'boolean') damaged(`${where}: done`)
  if (typeof notes !== 'string') damaged(`${where}: notes`)
  if (typeof order !== 'number' || !Number.isFinite(order)) damaged(`${where}: order`)
  const range = end === undefined || end === start ? { start } : { start, end }
  return { id, projectId, kind, title, ...range, done, notes, order }
}

function checkConsistency(projects: Project[], subtasks: Subtask[]): void {
  const projectsById = new Map(projects.map((p) => [p.id, p]))
  if (projectsById.size !== projects.length) damaged('two projects share an id')
  if (new Set(subtasks.map((s) => s.id)).size !== subtasks.length) {
    damaged('two subtasks share an id')
  }
  const publishCounts = new Map<string, number>()
  for (const subtask of subtasks) {
    const project = projectsById.get(subtask.projectId)
    if (!project) damaged(`subtask "${subtask.title}" belongs to no project`)
    if (subtask.kind !== 'publish') continue
    if (subtask.start !== project.publishDate || subtask.end !== undefined) {
      damaged(`"${project.title}" has its Publish subtask off its publish date`)
    }
    publishCounts.set(project.id, (publishCounts.get(project.id) ?? 0) + 1)
  }
  for (const project of projects) {
    if (publishCounts.get(project.id) !== 1) {
      damaged(`"${project.title}" needs exactly one Publish subtask`)
    }
  }
}

function damaged(detail: string): never {
  throw new BackupError(`This backup file is damaged (${detail}).`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isOneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return options.includes(value as T)
}
