import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { ProjectRow, Rows, SubtaskRow, SyncServer } from './remote'

// The address the app was opened at, read before the client below can tidy
// it: a refused Google sign-in comes back with its reason in the URL.
export const openedAt = typeof window === 'undefined' ? '' : window.location.href

// The project's URL and publishable key, set at build time: .env.local in
// development, GitHub Actions variables for the live site. Both are public
// by design; the database's rules (supabase/migrations) decide what each
// signed-in user may do. Without them the app runs signed-out only.
const url: string | undefined = import.meta.env.VITE_SUPABASE_URL
const key: string | undefined = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    : null

// Sync against the Supabase project: sync_push for writes, the two tables
// for reads, and Realtime for live announcements. Every call runs as the
// signed-in user, under the database's access rules.
export function supabaseServer(client: SupabaseClient): SyncServer {
  return {
    async push(rows: Rows) {
      const { error } = await client.rpc('sync_push', {
        project_rows: rows.projects,
        subtask_rows: rows.subtasks,
      })
      if (error) throw new Error(error.message)
    },

    async pull(since: string | null) {
      return {
        projects: await pullTable<ProjectRow>(client, 'projects', since),
        subtasks: await pullTable<SubtaskRow>(client, 'subtasks', since),
      }
    },

    subscribe(onChange: () => void) {
      const channel = client
        .channel('tracker-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, onChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'subtasks' }, onChange)
        .subscribe()
      return () => void client.removeChannel(channel)
    },
  }
}

// The server returns at most this many rows per request.
const PAGE_SIZE = 1000

async function pullTable<T>(
  client: SupabaseClient,
  table: 'projects' | 'subtasks',
  since: string | null,
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = client
      .from(table)
      .select('*')
      .order('updated_at')
      .order('id')
      .range(from, from + PAGE_SIZE - 1)
    if (since) query = query.gt('updated_at', since)
    const { data, error } = await query
    if (error) throw new Error(error.message)
    rows.push(...(data as T[]))
    if (data.length < PAGE_SIZE) return rows
  }
}
