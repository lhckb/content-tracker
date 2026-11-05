import {
  authUrl,
  CALLBACK_PAGE,
  CHANNEL_NAME,
  grantsDriveFile,
  LEAVING_KEY,
  RETURNING_KEY,
  type AuthResult,
  type ChannelLike,
  type ReadyMessage,
  type StatusMessage,
  type StorageLike,
} from '../lib/googleAuth'
import { isDocId } from '../lib/googleDocs'
import { db } from './db'
import { setIdeaDoc } from './ideas'
import { newId } from './ids'
import { setProjectDoc } from './projects'
import { supabase } from './supabase'

// Makes a Google Doc from a project's notes or an idea's description
// (docs/plans/google-docs.md), in a "Content Tracker" folder in the
// signed-in person's Drive, and remembers it on the project or idea.
//
// Google's permission comes as an access token with the drive.file scope,
// which reaches only files this app made. A tab goes to Google and back for
// it (see src/lib/googleAuth.ts), so the doc can open in that same tab. The
// token is kept in memory, never stored or sent anywhere but Google, and
// asked for again when it runs out (after an hour). It isn't Supabase's:
// Supabase hands over Google's token only at sign-in and never refreshes it.

// The OAuth client of the Google Cloud project used for sign-in, set at
// build time like the Supabase URL. Public by design. Without it, or
// without Supabase (it's for signed-in use only), there's no Google Doc
// button.
const clientId: string | undefined = import.meta.env.VITE_GOOGLE_CLIENT_ID

export const FOLDER_NAME = 'Content Tracker'
const FOLDER_TYPE = 'application/vnd.google-apps.folder'
const DOC_TYPE = 'application/vnd.google-apps.document'
const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files'
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'

// A token this close to running out is asked for again, so it can't expire
// halfway through making a doc.
const EXPIRY_MARGIN_MS = 60_000
// Finished requests are kept this long, to answer a callback page that
// asks again.
const KEEP_FINISHED_MS = 5 * 60_000

// Thrown when a doc couldn't be made. The message is meant to be shown to
// the user as-is. Nothing is saved when one is thrown.
export class GoogleDocsError extends Error {
  name = 'GoogleDocsError'
}

// Thrown to a request that a newer click replaced. Nothing to show.
export class GoogleDocsReplaced extends Error {
  name = 'GoogleDocsReplaced'
}

export interface DocTarget {
  kind: 'project' | 'idea'
  id: string
}

// While a click is being handled: waiting for Google in the other tab, then
// making the doc.
export type DocPhase = 'google' | 'creating'

// How a click ended: the doc opened in the new tab; the doc was made here
// (the Home Screen app, which opens no tabs); or the app is leaving for
// Google, to finish when it's back (see resume).
export type DocOutcome = 'opened' | 'made' | 'leaving'

// What the app needs from the browser, so tests can stand in for it.
export interface DocsBrowser {
  // Opens a blank tab, straight from the click; null if it was blocked.
  openTab(): { go(url: string): void } | null
  // The iPhone's Home Screen app.
  standalone(): boolean
  // Same-window navigation, for the Home Screen app.
  leaveFor(url: string): void
  storage: StorageLike
  channel(): ChannelLike
  // google-callback.html's address, where Google sends the tab back.
  callbackUrl: string
}

export interface GoogleDocsOptions {
  clientId: string
  fetch: typeof fetch
  browser: DocsBrowser
  now?: () => number
}

export interface GoogleDocs {
  // Whether a token for this account is in hand, so no trip to Google.
  hasToken(email: string): boolean
  // Drops the token, e.g. on signing out.
  forget(): void
  // Makes the doc and remembers it, replacing any earlier one (which stays
  // in Drive). Call it straight from a click, with nothing awaited before:
  // the new tab has to open while the click still counts.
  makeDoc(target: DocTarget, email: string, onPhase?: (phase: DocPhase) => void): Promise<DocOutcome>
  // Back in the Home Screen app from Google: makes the doc it left for.
  // Null if it didn't leave for one (or for another account).
  resume(email: string): Promise<{ target: DocTarget; docId: string } | null>
}

interface Token {
  email: string
  accessToken: string
  expiresAt: number
}

interface Request {
  // Google's answer, when the callback page brings it.
  answered: Promise<AuthResult>
  finish(outcome: { docId: string } | { error: string }): void
  replace(): void
}

export function makeGoogleDocs(options: GoogleDocsOptions): GoogleDocs {
  const { browser } = options
  const now = options.now ?? Date.now
  let token: Token | null = null
  let channel: ChannelLike | null = null
  const requests = new Map<string, { status: StatusMessage; onReady: (message: ReadyMessage) => void; finishedAt?: number }>()
  let latest: Request | null = null

  function heldToken(email: string): Token | null {
    if (token && (token.email !== email || now() >= token.expiresAt - EXPIRY_MARGIN_MS)) token = null
    return token
  }

  function acceptToken(email: string, result: AuthResult): void {
    if (result.error || !result.accessToken) {
      throw new GoogleDocsError(
        result.error === 'access_denied'
          ? "Google access wasn't allowed, so no doc was made."
          : `Google refused: ${result.error ?? 'no access token'}.`,
      )
    }
    if (!grantsDriveFile(result)) {
      throw new GoogleDocsError(
        'Content Tracker needs permission to make files in your Google Drive. Please try again and allow it.',
      )
    }
    token = {
      email,
      accessToken: result.accessToken,
      expiresAt: now() + (result.expiresIn ?? 3600) * 1000,
    }
  }

  // The app's end of the channel: answers the callback page of each
  // request this tab started. Other tabs' requests are left to them.
  function openChannel(): ChannelLike {
    if (channel) return channel
    channel = browser.channel()
    channel.addEventListener('message', (event) => {
      const message = event.data as Partial<ReadyMessage> | null
      if (message?.type !== 'ready' || typeof message.state !== 'string') return
      const request = requests.get(message.state)
      if (!request) return
      request.onReady(message as ReadyMessage)
      channel?.postMessage(request.status)
    })
    return channel
  }

  function startRequest(state: string): Request {
    const open = openChannel()
    for (const [key, { finishedAt }] of requests) {
      if (finishedAt !== undefined && now() - finishedAt > KEEP_FINISHED_MS) requests.delete(key)
    }
    let settle: { resolve: (result: AuthResult) => void; reject: (error: Error) => void }
    const answered = new Promise<AuthResult>((resolve, reject) => {
      settle = { resolve, reject }
    })
    // Not every request waits for Google; this keeps an unawaited rejection
    // from being reported.
    answered.catch(() => {})
    const entry = {
      status: { type: 'status', state } as StatusMessage,
      onReady: (message: ReadyMessage) => {
        if (message.result) settle.resolve(message.result)
      },
      finishedAt: undefined as number | undefined,
    }
    requests.set(state, entry)
    const finish = (outcome: { docId: string } | { error: string }) => {
      if (entry.finishedAt !== undefined) return
      entry.status = { type: 'status', state, ...outcome }
      entry.finishedAt = now()
      open.postMessage(entry.status)
    }
    return {
      answered,
      finish,
      replace() {
        settle.reject(new GoogleDocsReplaced())
        finish({ error: 'A newer request replaced this one.' })
      },
    }
  }

  async function drive<T>(url: string, init: RequestInit, accessToken: string): Promise<T> {
    let response: Response
    try {
      response = await options.fetch(url, {
        ...init,
        headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${accessToken}` },
      })
    } catch {
      throw new GoogleDocsError("Couldn't reach Google Drive. Check your connection and try again.")
    }
    if (response.status === 401) {
      // Revoked or expired early: the next try asks Google again.
      token = null
      throw new GoogleDocsError('Google asked to sign in again. Please try once more.')
    }
    if (!response.ok) {
      throw new GoogleDocsError(`Google Drive refused: ${await driveError(response)}`)
    }
    return (await response.json()) as T
  }

  // The app's folder, made if there's none. drive.file only sees folders
  // the app made, so this can't pick up one of the person's own; a trashed
  // one is left alone and replaced.
  async function folderId(accessToken: string): Promise<string> {
    const query = new URLSearchParams({
      q: `mimeType = '${FOLDER_TYPE}' and name = '${FOLDER_NAME}' and trashed = false`,
      spaces: 'drive',
      orderBy: 'createdTime',
      pageSize: '1',
      fields: 'files(id)',
    })
    const found = await drive<{ files?: { id: string }[] }>(`${DRIVE_FILES}?${query}`, {}, accessToken)
    const existing = found.files?.[0]?.id
    if (existing) return existing
    const made = await drive<{ id: string }>(
      `${DRIVE_FILES}?fields=id`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=UTF-8' },
        body: JSON.stringify({ name: FOLDER_NAME, mimeType: FOLDER_TYPE }),
      },
      accessToken,
    )
    return made.id
  }

  // One upload: Drive turns the plain text into a Google Doc, named and
  // filed at the same time. Empty text makes an empty doc.
  async function uploadDoc(accessToken: string, title: string, text: string): Promise<string> {
    const metadata = {
      name: title.trim() || 'Untitled',
      mimeType: DOC_TYPE,
      parents: [await folderId(accessToken)],
    }
    let made: { id?: unknown }
    if (!text.trim()) {
      made = await drive(
        `${DRIVE_FILES}?fields=id`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json; charset=UTF-8' },
          body: JSON.stringify(metadata),
        },
        accessToken,
      )
    } else {
      const boundary = `content-tracker-${newId()}`
      made = await drive(
        `${DRIVE_UPLOAD}?uploadType=multipart&fields=id`,
        {
          method: 'POST',
          headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
          body: multipartBody(boundary, metadata, text),
        },
        accessToken,
      )
    }
    if (!isDocId(made.id)) throw new GoogleDocsError('Google Drive answered in a way the app didn’t expect.')
    return made.id
  }

  // With the token in hand: reads the notes now, so the doc has what was
  // typed until the click, then makes and remembers the doc.
  async function createDoc(target: DocTarget, email: string): Promise<string> {
    const held = heldToken(email)
    if (!held) throw new GoogleDocsError('Google asked to sign in again. Please try once more.')
    if (target.kind === 'project') {
      const project = await db.projects.get(target.id)
      if (!project) throw new GoogleDocsError('This project no longer exists.')
      const docId = await uploadDoc(held.accessToken, project.title, project.notes)
      await setProjectDoc(target.id, docId)
      return docId
    }
    const idea = await db.ideas.get(target.id)
    if (!idea) throw new GoogleDocsError('This idea no longer exists.')
    const docId = await uploadDoc(held.accessToken, idea.title, idea.description)
    await setIdeaDoc(target.id, docId)
    return docId
  }

  return {
    hasToken(email) {
      return heldToken(email) !== null
    },

    forget() {
      token = null
    },

    async makeDoc(target, email, onPhase = () => {}) {
      const held = heldToken(email)
      const state = newId()
      if (browser.standalone()) {
        if (held) {
          onPhase('creating')
          await createDoc(target, email)
          return 'made'
        }
        browser.storage.setItem(LEAVING_KEY, JSON.stringify({ state, target, email }))
        browser.leaveFor(authUrl({ clientId: options.clientId, redirectUri: browser.callbackUrl, state, email }))
        return 'leaving'
      }

      // Nothing may be awaited before this: the tab opens from the click.
      const tab = browser.openTab()
      if (!tab) {
        throw new GoogleDocsError('The browser blocked the new tab. Allow pop-ups for this site, then try again.')
      }
      latest?.replace()
      const request = startRequest(state)
      latest = request
      try {
        if (held) {
          tab.go(`${browser.callbackUrl}#state=${encodeURIComponent(state)}`)
        } else {
          onPhase('google')
          tab.go(authUrl({ clientId: options.clientId, redirectUri: browser.callbackUrl, state, email }))
          acceptToken(email, await request.answered)
        }
        onPhase('creating')
        const docId = await createDoc(target, email)
        request.finish({ docId })
        return 'opened'
      } catch (error) {
        if (!(error instanceof GoogleDocsReplaced)) {
          request.finish({ error: error instanceof Error ? error.message : String(error) })
        }
        throw error
      } finally {
        if (latest === request) latest = null
      }
    },

    async resume(email) {
      const text = browser.storage.getItem(RETURNING_KEY)
      if (!text) return null
      browser.storage.removeItem(RETURNING_KEY)
      const back = parseReturning(text)
      if (!back || back.email !== email) return null
      acceptToken(email, back.result)
      const docId = await createDoc(back.target, email)
      return { target: back.target, docId }
    },
  }
}

function parseReturning(text: string): { target: DocTarget; email: string; result: AuthResult } | null {
  try {
    const value = JSON.parse(text) as { target?: Partial<DocTarget>; email?: unknown; result?: AuthResult }
    const { target, email, result } = value
    if (!target || (target.kind !== 'project' && target.kind !== 'idea') || typeof target.id !== 'string') return null
    if (typeof email !== 'string' || !result || typeof result.state !== 'string') return null
    return { target: { kind: target.kind, id: target.id }, email, result }
  } catch {
    return null
  }
}

export function multipartBody(boundary: string, metadata: object, text: string): string {
  return [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    '',
    text,
    `--${boundary}--`,
  ].join('\r\n')
}

async function driveError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } }
    if (body.error?.message) return body.error.message
  } catch {
    // Not JSON: fall through to the status.
  }
  return `error ${response.status}`
}

function realBrowser(): DocsBrowser {
  return {
    openTab() {
      const tab = window.open('about:blank', '_blank')
      if (!tab) return null
      // Google's pages and the doc shouldn't be able to reach back into the app.
      tab.opener = null
      return { go: (url) => tab.location.replace(url) }
    },
    standalone() {
      return (
        window.matchMedia?.('(display-mode: standalone)').matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true
      )
    },
    leaveFor(url) {
      window.location.assign(url)
    },
    // Read when used: Safari can refuse storage in some privacy settings,
    // which only the Home Screen app's round trip needs.
    storage: {
      getItem: (key) => {
        try {
          return window.sessionStorage.getItem(key)
        } catch {
          return null
        }
      },
      setItem: (key, value) => window.sessionStorage.setItem(key, value),
      removeItem: (key) => {
        try {
          window.sessionStorage.removeItem(key)
        } catch {
          // Nothing stored, then.
        }
      },
    },
    channel: () => new BroadcastChannel(CHANNEL_NAME),
    callbackUrl: new URL(CALLBACK_PAGE, `${window.location.origin}${window.location.pathname}`).href,
  }
}

// Null when this build can't make docs: no Google client ID, or no
// Supabase project (so nobody can be signed in).
export const googleDocs: GoogleDocs | null =
  supabase && clientId && typeof window !== 'undefined'
    ? makeGoogleDocs({ clientId, fetch: (...args) => fetch(...args), browser: realBrowser() })
    : null
