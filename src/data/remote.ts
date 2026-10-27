import type { ColorId, Platform, Project, Subtask, SubtaskKind } from '../types'

// The server side of sync, as rows shaped like the Postgres tables in
// supabase/migrations (snake_case, nulls, tombstones). supabase.ts talks to
// the real one; tests use fakeSyncServer.ts.

export interface ProjectRow {
  id: string
  title: string
  platform: Platform
  color: ColorId
  publish_date: string
  notes: string
  archived: boolean
  deleted: boolean
  edited_at: string
  // Set by the server; absent on rows being pushed.
  updated_at?: string
}

export interface SubtaskRow {
  id: string
  project_id: string
  kind: SubtaskKind
  title: string
  start_date: string
  end_date: string | null
  done: boolean
  notes: string
  sort_order: number
  deleted: boolean
  edited_at: string
  updated_at?: string
}

export interface Rows {
  projects: ProjectRow[]
  subtasks: SubtaskRow[]
}

export interface SyncServer {
  // Stores a batch; the server keeps whichever edit of each record is newest.
  push(rows: Rows): Promise<void>
  // Rows changed after `since` (all rows when null), including tombstones.
  pull(since: string | null): Promise<Rows>
  // Calls `onChange` when another device changes data; returns an unsubscribe.
  subscribe(onChange: () => void): () => void
}

export function projectToRow(project: Project, editedAt: string, deleted: boolean): ProjectRow {
  return {
    id: project.id,
    title: project.title,
    platform: project.platform,
    color: project.color,
    publish_date: project.publishDate,
    notes: project.notes,
    archived: project.archived,
    deleted,
    edited_at: editedAt,
  }
}

export function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    title: row.title,
    platform: row.platform,
    color: row.color,
    publishDate: row.publish_date,
    notes: row.notes,
    archived: row.archived,
  }
}

export function subtaskToRow(subtask: Subtask, editedAt: string, deleted: boolean): SubtaskRow {
  return {
    id: subtask.id,
    project_id: subtask.projectId,
    kind: subtask.kind,
    title: subtask.title,
    start_date: subtask.start,
    end_date: subtask.end ?? null,
    done: subtask.done,
    notes: subtask.notes,
    sort_order: subtask.order,
    deleted,
    edited_at: editedAt,
  }
}

export function rowToSubtask(row: SubtaskRow): Subtask {
  return {
    id: row.id,
    projectId: row.project_id,
    kind: row.kind,
    title: row.title,
    start: row.start_date,
    ...(row.end_date ? { end: row.end_date } : {}),
    done: row.done,
    notes: row.notes,
    order: row.sort_order,
  }
}
