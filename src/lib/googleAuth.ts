import { docUrl, isDocId } from './googleDocs'

// Getting Google's permission to make a doc (docs/plans/google-docs.md), by
// sending a tab to Google and back, with no Google script in the app:
//
// - In a browser tab, the click opens a new tab that goes to Google. Google
//   asks for consent the first time and passes straight through after that,
//   then sends the tab to google-callback.html with an access token. That
//   page hands the token to the app's tab over a BroadcastChannel; the app
//   makes the doc and answers with its id, and the page turns into the doc.
//   With a token already in hand, the new tab goes straight to the page.
// - In the iPhone's Home Screen app, a new tab would leave the app, so the
//   app itself goes to Google and back, as sign-in does. The page hands the
//   token back through sessionStorage, and the app finishes the doc.
//
// This module holds both sides' shared pieces and the page's logic. The
// app's side is in src/data/googleDocs.ts.

export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
export const CALLBACK_PAGE = 'google-callback.html'
export const CHANNEL_NAME = 'content-tracker-google-docs'
// sessionStorage, for the Home Screen app's round trip: the request on the
// way out, and the request with Google's answer on the way back.
export const LEAVING_KEY = 'content-tracker:google-doc-leaving'
export const RETURNING_KEY = 'content-tracker:google-doc-returning'

export function authUrl({
  clientId,
  redirectUri,
  state,
  email,
}: {
  clientId: string
  redirectUri: string
  state: string
  email: string
}): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'token',
    scope: DRIVE_FILE_SCOPE,
    include_granted_scopes: 'true',
    state,
  })
  // Suggests the signed-in account, so Google skips choosing one.
  if (email) params.set('login_hint', email)
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

// Google's answer, from the callback page's address after "#". A page the
// app opened itself, with a token already in hand, has only the state.
export interface AuthResult {
  state: string
  accessToken?: string
  expiresIn?: number
  scope?: string
  error?: string
}

export function parseAuthResult(hash: string): AuthResult | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  const state = params.get('state')
  if (!state) return null
  const result: AuthResult = { state }
  const accessToken = params.get('access_token')
  const expiresIn = Number(params.get('expires_in'))
  const scope = params.get('scope')
  const error = params.get('error')
  if (accessToken) result.accessToken = accessToken
  if (Number.isFinite(expiresIn) && expiresIn > 0) result.expiresIn = expiresIn
  if (scope !== null) result.scope = scope
  if (error) result.error = error
  return result
}

export function grantsDriveFile(result: AuthResult): boolean {
  return (result.scope ?? '').split(' ').includes(DRIVE_FILE_SCOPE)
}

// The callback page tells the app's tabs it's there, with Google's answer
// the first time. Only the tab that started the request answers.
export interface ReadyMessage {
  type: 'ready'
  state: string
  result?: AuthResult
}

// The app's answer: still working, the doc made, or why not.
export interface StatusMessage {
  type: 'status'
  state: string
  docId?: string
  error?: string
}

export interface ChannelLike {
  postMessage(message: unknown): void
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void
}

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export interface CallbackPage {
  hash: string
  storage: StorageLike
  channel: ChannelLike
  // Takes the token out of the address bar and the history.
  clearAddress(): void
  go(url: string): void
  appUrl: string
  show(message: string): void
  // Calls `tick` every `ms` until the returned function is called.
  every(tick: () => void, ms: number): () => void
}

// How many seconds the page waits for an answer before saying so.
const PATIENCE = 6

export function runCallbackPage(page: CallbackPage): void {
  const result = parseAuthResult(page.hash)
  page.clearAddress()
  if (!result) {
    page.show("This page is part of Content Tracker's Google Docs. You can close it.")
    return
  }

  // Back from Google in the Home Screen app: hand the answer back.
  const leaving = readJson<{ state?: string }>(page.storage.getItem(LEAVING_KEY))
  if (leaving?.state === result.state) {
    page.storage.removeItem(LEAVING_KEY)
    page.storage.setItem(RETURNING_KEY, JSON.stringify({ ...leaving, result }))
    page.go(page.appUrl)
    return
  }

  page.show('Making the Google Doc…')
  let waited = 0
  let done = false
  let stop = () => {}
  page.channel.addEventListener('message', (event) => {
    const message = event.data as Partial<StatusMessage> | null
    if (done || message?.type !== 'status' || message.state !== result.state) return
    waited = 0
    if (message.docId !== undefined) {
      done = true
      stop()
      if (isDocId(message.docId)) page.go(docUrl(message.docId))
      else page.show('Google Drive answered in a way the app didn’t expect. You can close this tab.')
    } else if (message.error !== undefined) {
      done = true
      stop()
      page.show(`No Google Doc was made. ${message.error} You can close this tab.`)
    }
  })
  // Google's answer goes once; after that the page only asks again, in case
  // it missed the app's answer.
  const ready: ReadyMessage = { type: 'ready', state: result.state, result }
  page.channel.postMessage(ready)
  stop = page.every(() => {
    if (done) return
    waited += 1
    if (waited >= PATIENCE) {
      done = true
      stop()
      page.show(
        "Content Tracker isn't answering, so no doc was made. Go back to its tab and try again. You can close this one.",
      )
      return
    }
    page.channel.postMessage({ type: 'ready', state: result.state } satisfies ReadyMessage)
  }, 1000)
}

function readJson<T>(text: string | null): T | null {
  if (!text) return null
  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}
