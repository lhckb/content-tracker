import type { ProjectRow, Rows, SubtaskRow, SyncServer } from './remote'

// An in-memory stand-in for the Supabase side of sync, for tests. It follows
// the same rules as supabase/migrations: the newer edit of each record wins,
// and updated_at is stamped by the server and only moves forward.
export class FakeSyncServer implements SyncServer {
  projects = new Map<string, ProjectRow>()
  subtasks = new Map<string, SubtaskRow>()
  // While true, every call fails the way fetch does with no connection.
  unreachable = false
  // The `since` each pull asked for, oldest first.
  pulls: (string | null)[] = []
  // When set, push waits for it before storing, to test edits made mid-push.
  pushGate: Promise<void> | null = null

  private clock = Date.parse('2026-10-27T12:00:00Z')
  private listeners = new Set<() => void>()

  async push(rows: Rows): Promise<void> {
    this.check()
    if (this.pushGate) await this.pushGate
    for (const row of rows.projects) this.store(this.projects, row)
    for (const row of rows.subtasks) this.store(this.subtasks, row)
    this.announce()
  }

  async pull(since: string | null): Promise<Rows> {
    this.check()
    this.pulls.push(since)
    const changed = <T extends { updated_at?: string }>(rows: Map<string, T>) =>
      [...rows.values()].filter((row) => since === null || (row.updated_at ?? '') > since)
    return { projects: changed(this.projects), subtasks: changed(this.subtasks) }
  }

  subscribe(onChange: () => void): () => void {
    this.listeners.add(onChange)
    return () => this.listeners.delete(onChange)
  }

  // A change made on another device reaching the server.
  editFromAnotherDevice(rows: Partial<Rows>): void {
    for (const row of rows.projects ?? []) this.store(this.projects, row)
    for (const row of rows.subtasks ?? []) this.store(this.subtasks, row)
    this.announce()
  }

  private store<T extends { id: string; edited_at: string; updated_at?: string }>(
    rows: Map<string, T>,
    row: T,
  ): void {
    const existing = rows.get(row.id)
    if (existing && existing.edited_at >= row.edited_at) return
    this.clock += 1000
    rows.set(row.id, { ...row, updated_at: new Date(this.clock).toISOString() })
  }

  private announce(): void {
    for (const listener of this.listeners) listener()
  }

  private check(): void {
    if (this.unreachable) throw new TypeError('Failed to fetch')
  }
}
