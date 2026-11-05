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
// Google's own sign-in script asks for an access token with the drive.file
// scope, which reaches only files this app made. The token is kept in
// memory, never stored or sent anywhere but Google, and asked for again
// when it runs out (after an hour). It isn't Supabase's: Supabase hands
// over Google's token only at sign-in and never refreshes it.

// The OAuth client of the Google Cloud project used for sign-in, set at
// build time like the Supabase URL. Public by design. Without it, or
// without Supabase (it's for signed-in use only), there's no Google Doc
// button.
const clientId: string | undefined = import.meta.env.VITE_GOOGLE_CLIENT_ID

export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
export const FOLDER_NAME = 'Content Tracker'
const FOLDER_TYPE = 'application/vnd.google-apps.folder'
const DOC_TYPE = 'application/vnd.google-apps.document'
const GOOGLE_SCRIPT = 'https://accounts.google.com/gsi/client'
const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files'
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'

// A token this close to running out is asked for again, so it can't expire
// halfway through making a doc.
const EXPIRY_MARGIN_MS = 60_000

// Thrown when a doc couldn't be made. The message is meant to be shown to
// the user as-is. Nothing is saved when one is thrown.
export class GoogleDocsError extends Error {
  name = 'GoogleDocsError'
}

// The parts of Google's script (google.accounts.oauth2) used here.
export interface TokenResponse {
  access_token?: string
  expires_in?: number | string
  scope?: string
  error?: string
  error_description?: string
}

export interface TokenClientConfig {
  client_id: string
  scope: string
  // Suggests this account in Google's window.
  login_hint?: string
  // '' asks for consent only the first time.
  prompt?: string
  callback: (response: TokenResponse) => void
  error_callback?: (error: { type: string; message?: string }) => void
}

export interface OAuth2 {
  initTokenClient(config: TokenClientConfig): { requestAccessToken(): void }
  hasGrantedAllScopes(response: TokenResponse, ...scopes: string[]): boolean
}

declare global {
  interface Window {
    google?: { accounts?: { oauth2?: OAuth2 } }
  }
}

export interface GoogleDocsOptions {
  clientId: string
  // Loads Google's script (once) and returns google.accounts.oauth2.
  loadOAuth2: () => Promise<OAuth2>
  fetch: typeof fetch
  now?: () => number
}

export interface GoogleDocs {
  // Starts loading Google's script, so a click can open Google's window
  // straight away (browsers block windows opened long after a click).
  preload(): void
  // Whether a token for this account is in hand, so making a doc won't
  // open Google's window.
  hasToken(email: string): boolean
  // Drops the token, e.g. on signing out.
  forget(): void
  // Each makes the doc and remembers it, replacing any earlier one (which
  // stays in Drive), and returns its id. Call them straight from a click:
  // Google's window, when needed, opens first.
  createProjectDoc(projectId: string, email: string): Promise<string>
  createIdeaDoc(ideaId: string, email: string): Promise<string>
}

interface Token {
  email: string
  accessToken: string
  expiresAt: number
}

export function makeGoogleDocs(options: GoogleDocsOptions): GoogleDocs {
  const now = options.now ?? Date.now
  let token: Token | null = null
  let loading: Promise<OAuth2> | null = null

  function loadOAuth2(): Promise<OAuth2> {
    if (!loading) {
      const attempt = options.loadOAuth2()
      loading = attempt
      // A failed load (offline) is tried again on the next click.
      attempt.catch(() => {
        if (loading === attempt) loading = null
      })
    }
    return loading
  }

  function heldToken(email: string): Token | null {
    if (token && (token.email !== email || now() >= token.expiresAt - EXPIRY_MARGIN_MS)) token = null
    return token
  }

  async function getToken(email: string): Promise<string> {
    const held = heldToken(email)
    if (held) return held.accessToken
    const oauth2 = await loadOAuth2()
    const response = await new Promise<TokenResponse>((resolve, reject) => {
      oauth2
        .initTokenClient({
          client_id: options.clientId,
          scope: DRIVE_FILE_SCOPE,
          ...(email ? { login_hint: email } : {}),
          prompt: '',
          callback: resolve,
          error_callback: (error) => reject(new GoogleDocsError(windowProblem(error.type))),
        })
        .requestAccessToken()
    })
    if (response.error || !response.access_token) {
      throw new GoogleDocsError(
        response.error === 'access_denied'
          ? "Google access wasn't allowed, so no doc was made."
          : `Google refused: ${response.error_description || response.error || 'no access token'}.`,
      )
    }
    if (!oauth2.hasGrantedAllScopes(response, DRIVE_FILE_SCOPE)) {
      throw new GoogleDocsError(
        'Content Tracker needs permission to make files in your Google Drive. Please try again and allow it.',
      )
    }
    const seconds = Number(response.expires_in)
    token = {
      email,
      accessToken: response.access_token,
      expiresAt: now() + (Number.isFinite(seconds) && seconds > 0 ? seconds : 3600) * 1000,
    }
    return token.accessToken
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

  return {
    preload() {
      loadOAuth2().catch(() => {})
    },
    hasToken(email) {
      return heldToken(email) !== null
    },
    forget() {
      token = null
    },
    async createProjectDoc(projectId, email) {
      // The token comes first: Google's window has to open while the
      // click still counts.
      const accessToken = await getToken(email)
      const project = await db.projects.get(projectId)
      if (!project) throw new GoogleDocsError('This project no longer exists.')
      const docId = await uploadDoc(accessToken, project.title, project.notes)
      await setProjectDoc(projectId, docId)
      return docId
    },
    async createIdeaDoc(ideaId, email) {
      const accessToken = await getToken(email)
      const idea = await db.ideas.get(ideaId)
      if (!idea) throw new GoogleDocsError('This idea no longer exists.')
      const docId = await uploadDoc(accessToken, idea.title, idea.description)
      await setIdeaDoc(ideaId, docId)
      return docId
    },
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

function windowProblem(type: string): string {
  if (type === 'popup_failed_to_open') {
    return "The browser blocked Google's window. Allow pop-ups for this site, then try again."
  }
  if (type === 'popup_closed') return "Google's window was closed, so no doc was made."
  return "Google's sign-in didn't finish, so no doc was made. Please try again."
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

// Adds Google's script to the page, once, and waits for it.
function loadGoogleScript(): Promise<OAuth2> {
  const ready = window.google?.accounts?.oauth2
  if (ready) return Promise.resolve(ready)
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = GOOGLE_SCRIPT
    script.async = true
    script.onload = () => {
      const oauth2 = window.google?.accounts?.oauth2
      if (oauth2) resolve(oauth2)
      else reject(new GoogleDocsError("Google's sign-in didn't load. Please try again."))
    }
    script.onerror = () => {
      script.remove()
      reject(new GoogleDocsError("Couldn't reach Google. Check your connection and try again."))
    }
    document.head.append(script)
  })
}

// Null when this build can't make docs: no Google client ID, or no
// Supabase project (so nobody can be signed in).
export const googleDocs: GoogleDocs | null =
  supabase && clientId
    ? makeGoogleDocs({ clientId, loadOAuth2: loadGoogleScript, fetch: (...args) => fetch(...args) })
    : null
