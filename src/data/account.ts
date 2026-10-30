import type { User } from '@supabase/supabase-js'
import { useSyncExternalStore } from 'react'
import { deleteAccountSpace, switchSpace } from './db'
import { refreshNotifications, turnOffNotifications } from './notifications'
import { openedAt, supabase, supabaseServer } from './supabase'
import { countPendingChanges, startSync, type SyncEngine } from './sync'

// Who's signed in on this device, and what follows from it: the space the
// app reads and writes (db.ts) and whether sync runs (sync.ts).

export type Account =
  // This build has no Supabase project configured: signed-out use only.
  | { state: 'unavailable' }
  | { state: 'loading' }
  | { state: 'signed-out' }
  | { state: 'signed-in'; userId: string; email: string; name: string }

let account: Account = supabase ? { state: 'loading' } : { state: 'unavailable' }
const listeners = new Set<() => void>()
let engine: SyncEngine | null = null

function setAccount(next: Account): void {
  account = next
  for (const listener of listeners) listener()
}

export function getAccount(): Account {
  return account
}

export function useAccount(): Account {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange)
      return () => listeners.delete(onChange)
    },
    getAccount,
    getAccount,
  )
}

// Picks up a stored session and follows sign-ins and sign-outs from then
// on. Called once, at startup.
export function startAccount(): void {
  if (!supabase) return
  supabase.auth.onAuthStateChange((_event, session) => {
    // Supabase asks not to call it again from inside this callback.
    setTimeout(() => follow(session?.user ?? null))
  })
}

function follow(user: User | null): void {
  if (!user) {
    // Signed out, or the session ended on its own. Only signOut() removes
    // the account's copy from the device; an expired session keeps it, and
    // any unsent changes, for the next sign-in.
    engine?.stop()
    engine = null
    switchSpace({ kind: 'guest' })
    setAccount({ state: 'signed-out' })
    return
  }
  if (account.state === 'signed-in' && account.userId === user.id) return
  switchSpace({ kind: 'account', userId: user.id })
  engine?.stop()
  engine = supabase ? startSync(supabaseServer(supabase)) : null
  setAccount({
    state: 'signed-in',
    userId: user.id,
    email: user.email ?? '',
    name: (user.user_metadata?.full_name as string | undefined) ?? user.email ?? '',
  })
  void refreshNotifications().catch((error: unknown) => console.warn('Reminders were not refreshed:', error))
}

// Leaves for Google's sign-in page; Supabase brings the browser back here.
export async function signInWithGoogle(): Promise<void> {
  if (!supabase) return
  const here = `${window.location.origin}${window.location.pathname}`
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: here },
  })
  if (error) throw new Error(error.message)
}

export type SignOutResult = { ok: true } | { ok: false; unsynced: number }

// Syncs one last time, then signs out and removes the account's copy from
// this device. If some changes still haven't reached the server, it stops
// and reports how many, unless told to discard them.
export async function signOut({ discardUnsynced = false } = {}): Promise<SignOutResult> {
  if (account.state !== 'signed-in' || !supabase) return { ok: true }
  const { userId } = account
  await engine?.syncNow()
  const unsynced = await countPendingChanges()
  if (unsynced > 0 && !discardUnsynced) return { ok: false, unsynced }
  // Reminders belong to the account, so they stop on this device.
  await turnOffNotifications()
  engine?.stop()
  engine = null
  await supabase.auth.signOut()
  await deleteAccountSpace(userId)
  setAccount({ state: 'signed-out' })
  return { ok: true }
}

export function syncNow(): Promise<void> {
  return engine?.syncNow() ?? Promise.resolve()
}

// Why a sign-in didn't complete, if the app was opened by one coming back
// refused (the reason arrives in the URL, which is then tidied); otherwise
// null. Read once, as the app loads.
export const startupSignInError: string | null = readSignInError()

function readSignInError(): string | null {
  if (!openedAt) return null
  const opened = new URL(openedAt)
  const params = new URLSearchParams(opened.search)
  for (const [k, v] of new URLSearchParams(opened.hash.slice(1))) params.set(k, v)
  const code = params.get('error_code')
  if (!code && !params.get('error')) return null
  window.history.replaceState(null, '', opened.pathname)
  return code === 'signup_disabled' || code === 'user_not_found'
    ? "This Google account isn't allowed to use Content Tracker."
    : "Sign-in didn't complete. Please try again."
}

// Automated tests sign in to the dev project with a password instead of
// Google (development builds only; production has no password sign-in).
if (import.meta.env.DEV && supabase && typeof window !== 'undefined') {
  const client = supabase
  Object.assign(window, {
    contentTrackerTest: {
      signInWithPassword: (email: string, password: string) =>
        client.auth.signInWithPassword({ email, password }),
    },
  })
}
