import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addIdea, clearAllData, createProject, getIdeas, getProject } from '.'
import {
  DRIVE_FILE_SCOPE,
  LEAVING_KEY,
  RETURNING_KEY,
  runCallbackPage,
  type StorageLike,
} from '../lib/googleAuth'
import {
  FOLDER_NAME,
  GoogleDocsError,
  GoogleDocsReplaced,
  makeGoogleDocs,
  type DocPhase,
  type DocsBrowser,
  type GoogleDocs,
} from './googleDocs'

const EMAIL = 'luis@example.com'
const CALLBACK = 'https://app.example/google-callback.html'
const APP = 'https://app.example/'
const FOLDER_TYPE = 'application/vnd.google-apps.folder'
const DOC_TYPE = 'application/vnd.google-apps.document'

function memoryStorage(): StorageLike & { items: Map<string, string> } {
  const items = new Map<string, string>()
  return {
    items,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
  }
}

// Stands in for the browser: tabs only record where they were sent.
class FakeBrowser implements DocsBrowser {
  tabs: string[] = []
  blocked = false
  isStandalone = false
  left: string[] = []
  storage = memoryStorage()
  callbackUrl = CALLBACK
  channels: BroadcastChannel[] = []
  readonly channelName = `test-google-docs-${Math.random()}`

  openTab() {
    if (this.blocked) return null
    const index = this.tabs.push('about:blank') - 1
    return { go: (url: string) => void (this.tabs[index] = url) }
  }
  standalone() {
    return this.isStandalone
  }
  leaveFor(url: string) {
    this.left.push(url)
  }
  channel() {
    const channel = new BroadcastChannel(this.channelName)
    this.channels.push(channel)
    return channel
  }
}

interface Call {
  url: URL
  method: string
  headers: Record<string, string>
  body?: string
}

// Stands in for the Drive API. `fail` can answer a call instead.
class FakeDrive {
  calls: Call[] = []
  folders: string[] = []
  docs = 0
  fail: ((call: Call) => Response | Error | undefined) | null = null

  fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const call: Call = {
      url: new URL(String(input)),
      method: init?.method ?? 'GET',
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body as string | undefined,
    }
    this.calls.push(call)
    const failure = this.fail?.(call)
    if (failure instanceof Error) throw failure
    if (failure) return failure
    if (call.method === 'GET') return json({ files: this.folders.map((id) => ({ id })) })
    if (call.url.pathname === '/drive/v3/files' && JSON.parse(call.body!).mimeType === FOLDER_TYPE) {
      const id = `folder-${this.folders.length + 1}`
      this.folders.push(id)
      return json({ id })
    }
    this.docs += 1
    return json({ id: `doc-${this.docs}` })
  }

  docCalls() {
    return this.calls.filter((c) => c.method === 'POST' && !c.body?.includes(FOLDER_TYPE))
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

// The two parts of a multipart upload: its metadata and its text.
function parts(call: Call): { metadata: Record<string, unknown>; text: string; contentTypes: string[] } {
  const boundary = /boundary=(.+)$/.exec(call.headers['Content-Type'])![1]
  const sections = call.body!.split(`--${boundary}`).slice(1, -1)
  const [metadataPart, textPart] = sections.map((section) => {
    const [head, ...rest] = section.replace(/^\r\n/, '').split('\r\n\r\n')
    return { head, body: rest.join('\r\n\r\n').replace(/\r\n$/, '') }
  })
  return {
    metadata: JSON.parse(metadataPart.body),
    text: textPart.body,
    contentTypes: [metadataPart.head, textPart.head],
  }
}

let browser: FakeBrowser
let drive: FakeDrive
let clock: number
let docs: GoogleDocs
let tokens: number
const pages: BroadcastChannel[] = []

// Google sending the tab back to the callback page: a token for drive.file
// (and what sign-in already granted), or `answer` instead.
function googleAnswers(sentTo: string, answer: Record<string, string> = {}): string {
  const state = new URL(sentTo).searchParams.get('state')!
  tokens += 1
  const params = new URLSearchParams(
    Object.keys(answer).length > 0
      ? { state, ...answer }
      : {
          state,
          access_token: `token-${tokens}`,
          token_type: 'Bearer',
          expires_in: '3599',
          scope: `email profile ${DRIVE_FILE_SCOPE}`,
        },
  )
  return `#${params}`
}

// Runs google-callback.html's logic with this hash, in its own "tab".
function openCallbackPage(hash: string, storage: StorageLike = memoryStorage()) {
  const page = { went: [] as string[], shown: [] as string[], cleared: false, ticks: [] as (() => void)[] }
  const channel = new BroadcastChannel(browser.channelName)
  pages.push(channel)
  runCallbackPage({
    hash,
    storage,
    channel,
    clearAddress: () => void (page.cleared = true),
    go: (url) => void page.went.push(url),
    appUrl: APP,
    show: (message) => void page.shown.push(message),
    every: (tick) => {
      page.ticks.push(tick)
      return () => void (page.ticks = [])
    },
  })
  return page
}

function newProject(notes = 'Hook: the 5am alarm\nShots: desk, coffee, window') {
  return createProject({
    title: 'Morning routine vlog',
    platform: 'youtube',
    publishDate: '2026-11-14',
    withDefaultSubtasks: false,
    notes,
  })
}

// A click, Google answering in the new tab, and the page landing on the doc.
async function makeWithGoogle(id: string, kind: 'project' | 'idea' = 'project') {
  const phases: DocPhase[] = []
  const outcome = docs.makeDoc({ kind, id }, EMAIL, (phase) => phases.push(phase))
  const page = openCallbackPage(googleAnswers(browser.tabs.at(-1)!))
  return { outcome: await outcome, page, phases }
}

beforeEach(async () => {
  await clearAllData()
  browser = new FakeBrowser()
  drive = new FakeDrive()
  clock = Date.parse('2026-11-05T12:00:00Z')
  tokens = 0
  docs = makeGoogleDocs({
    clientId: 'client-123.apps.googleusercontent.com',
    fetch: drive.fetch,
    browser,
    now: () => clock,
  })
})

afterEach(() => {
  for (const channel of [...browser.channels, ...pages.splice(0)]) channel.close()
})

describe('making a doc in a new tab', () => {
  it('opens a tab to Google, then makes the doc and turns that tab into it', async () => {
    const id = await newProject()
    const phases: DocPhase[] = []
    const outcome = docs.makeDoc({ kind: 'project', id }, EMAIL, (phase) => phases.push(phase))

    // The tab opened on the click and went straight to Google.
    expect(browser.tabs).toHaveLength(1)
    const google = new URL(browser.tabs[0])
    expect(google.origin + google.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(Object.fromEntries(google.searchParams)).toEqual({
      client_id: 'client-123.apps.googleusercontent.com',
      redirect_uri: CALLBACK,
      response_type: 'token',
      scope: 'https://www.googleapis.com/auth/drive.file',
      include_granted_scopes: 'true',
      login_hint: EMAIL,
      state: expect.any(String),
    })
    expect(phases).toEqual(['google'])

    const page = openCallbackPage(googleAnswers(browser.tabs[0]))
    expect(page.cleared).toBe(true)
    expect(page.shown).toEqual(['Making the Google Doc…'])
    expect(await outcome).toBe('opened')
    expect(phases).toEqual(['google', 'creating'])
    await vi.waitFor(() => expect(page.went).toEqual(['https://docs.google.com/document/d/doc-1/edit']))
    expect((await getProject(id))?.docId).toBe('doc-1')
  })

  it('makes the folder, then the doc in it with the notes', async () => {
    await makeWithGoogle(await newProject())
    const [search, folder, upload] = drive.calls
    expect(search.method).toBe('GET')
    expect(search.url.searchParams.get('q')).toBe(
      `mimeType = '${FOLDER_TYPE}' and name = '${FOLDER_NAME}' and trashed = false`,
    )
    expect(search.headers.Authorization).toBe('Bearer token-1')
    expect(JSON.parse(folder.body!)).toEqual({ name: 'Content Tracker', mimeType: FOLDER_TYPE })
    expect(upload.url.origin + upload.url.pathname).toBe('https://www.googleapis.com/upload/drive/v3/files')
    expect(upload.url.searchParams.get('uploadType')).toBe('multipart')
    const { metadata, text, contentTypes } = parts(upload)
    expect(metadata).toEqual({ name: 'Morning routine vlog', mimeType: DOC_TYPE, parents: ['folder-1'] })
    expect(text).toBe('Hook: the 5am alarm\nShots: desk, coffee, window')
    expect(contentTypes).toEqual([
      'Content-Type: application/json; charset=UTF-8',
      'Content-Type: text/plain; charset=UTF-8',
    ])
  })

  it('with the token in hand, the tab skips Google, and the folder is reused', async () => {
    const id = await newProject()
    await makeWithGoogle(id)
    expect(docs.hasToken(EMAIL)).toBe(true)
    drive.calls = []
    const phases: DocPhase[] = []
    const outcome = docs.makeDoc({ kind: 'project', id }, EMAIL, (phase) => phases.push(phase))
    const sentTo = new URL(browser.tabs[1])
    expect(sentTo.origin + sentTo.pathname).toBe(CALLBACK)
    const page = openCallbackPage(sentTo.hash)
    expect(await outcome).toBe('opened')
    expect(phases).toEqual(['creating'])
    await vi.waitFor(() => expect(page.went).toEqual(['https://docs.google.com/document/d/doc-2/edit']))
    expect(drive.calls.map((c) => c.method)).toEqual(['GET', 'POST'])
    expect(parts(drive.calls[1]).metadata.parents).toEqual(['folder-1'])
    expect((await getProject(id))?.docId).toBe('doc-2')
  })

  it('makes an empty doc from empty notes, still in the folder', async () => {
    const id = await newProject('  \n')
    await makeWithGoogle(id)
    const [made] = drive.docCalls()
    expect(made.url.pathname).toBe('/drive/v3/files')
    expect(JSON.parse(made.body!)).toEqual({ name: 'Morning routine vlog', mimeType: DOC_TYPE, parents: ['folder-1'] })
  })

  it('keeps accents, emoji and line breaks in the text', async () => {
    const notes = 'Café ☕️ às 5h\n\n– roteiro'
    await makeWithGoogle(await newProject(notes))
    expect(parts(drive.docCalls()[0]).text).toBe(notes)
  })

  it('makes a doc from an idea’s description', async () => {
    const id = await addIdea({ title: 'Studio tour', platform: 'instagram', description: 'New shelves' })
    await makeWithGoogle(id, 'idea')
    const { metadata, text } = parts(drive.docCalls()[0])
    expect(metadata.name).toBe('Studio tour')
    expect(text).toBe('New shelves')
    expect((await getIdeas())[0].docId).toBe('doc-1')
  })

  it('a click while waiting for Google replaces the earlier request', async () => {
    const id = await newProject()
    const first = docs.makeDoc({ kind: 'project', id }, EMAIL)
    const firstTab = browser.tabs[0]
    const second = docs.makeDoc({ kind: 'project', id }, EMAIL)
    await expect(first).rejects.toThrow(GoogleDocsReplaced)

    // The first tab, if Google still sends it back, says so and goes nowhere.
    const stale = openCallbackPage(googleAnswers(firstTab))
    await vi.waitFor(() => expect(stale.shown.at(-1)).toMatch(/A newer request replaced this one/))
    expect(stale.went).toEqual([])

    const page = openCallbackPage(googleAnswers(browser.tabs[1]))
    expect(await second).toBe('opened')
    await vi.waitFor(() => expect(page.went).toEqual(['https://docs.google.com/document/d/doc-1/edit']))
  })
})

describe('the token', () => {
  it('is asked for again once it’s about to run out', async () => {
    const id = await newProject()
    await makeWithGoogle(id)
    clock += 3599_000 - 61_000
    expect(docs.hasToken(EMAIL)).toBe(true)
    clock += 2_000
    expect(docs.hasToken(EMAIL)).toBe(false)
    const { outcome } = await makeWithGoogle(id)
    expect(outcome).toBe('opened')
    expect(new URL(browser.tabs[1]).hostname).toBe('accounts.google.com')
  })

  it('belongs to one account, and is dropped on sign-out', async () => {
    await makeWithGoogle(await newProject())
    expect(docs.hasToken('someone@example.com')).toBe(false)
    docs.forget()
    expect(docs.hasToken(EMAIL)).toBe(false)
  })
})

describe('when it goes wrong, nothing is saved', () => {
  async function expectNothingSaved(id: string, attempt: Promise<unknown>, message: RegExp) {
    await expect(attempt).rejects.toThrow(GoogleDocsError)
    await expect(attempt).rejects.toThrow(message)
    expect(await getProject(id)).not.toHaveProperty('docId')
  }

  it('Google access is refused: the app and the tab both say so', async () => {
    const id = await newProject()
    const attempt = docs.makeDoc({ kind: 'project', id }, EMAIL)
    const page = openCallbackPage(googleAnswers(browser.tabs[0], { error: 'access_denied' }))
    await expectNothingSaved(id, attempt, /wasn't allowed/)
    await vi.waitFor(() => expect(page.shown.at(-1)).toMatch(/^No Google Doc was made\. Google access wasn't allowed/))
    expect(page.went).toEqual([])
    expect(drive.calls).toEqual([])
  })

  it('access given without Drive', async () => {
    const id = await newProject()
    const attempt = docs.makeDoc({ kind: 'project', id }, EMAIL)
    openCallbackPage(googleAnswers(browser.tabs[0], { access_token: 't', expires_in: '3599', scope: 'email profile' }))
    await expectNothingSaved(id, attempt, /needs permission/)
    expect(docs.hasToken(EMAIL)).toBe(false)
  })

  it('the browser blocks the new tab', async () => {
    const id = await newProject()
    browser.blocked = true
    await expectNothingSaved(id, docs.makeDoc({ kind: 'project', id }, EMAIL), /blocked the new tab/)
  })

  it('offline', async () => {
    const id = await newProject()
    drive.fail = () => new TypeError('Failed to fetch')
    const attempt = docs.makeDoc({ kind: 'project', id }, EMAIL)
    const page = openCallbackPage(googleAnswers(browser.tabs[0]))
    await expectNothingSaved(id, attempt, /Couldn't reach Google Drive/)
    await vi.waitFor(() => expect(page.shown.at(-1)).toMatch(/Couldn't reach Google Drive/))
  })

  it('Drive refuses, with Google’s reason', async () => {
    const id = await newProject()
    drive.fail = (call) =>
      call.url.pathname.startsWith('/upload')
        ? json({ error: { code: 403, message: 'Google Drive API has not been used in project 123' } }, 403)
        : undefined
    const attempt = docs.makeDoc({ kind: 'project', id }, EMAIL)
    openCallbackPage(googleAnswers(browser.tabs[0]))
    await expectNothingSaved(id, attempt, /Google Drive refused: Google Drive API has not been used/)
  })

  it('the token stopped working: dropped, so the next click goes to Google again', async () => {
    const id = await newProject()
    drive.fail = () => json({ error: { code: 401, message: 'Invalid Credentials' } }, 401)
    const attempt = docs.makeDoc({ kind: 'project', id }, EMAIL)
    openCallbackPage(googleAnswers(browser.tabs[0]))
    await expectNothingSaved(id, attempt, /sign in again/)
    expect(docs.hasToken(EMAIL)).toBe(false)
  })

  it('Drive answers with something that isn’t a file id', async () => {
    const id = await newProject()
    drive.fail = (call) => (call.url.pathname.startsWith('/upload') ? json({ id: '../elsewhere' }) : undefined)
    const attempt = docs.makeDoc({ kind: 'project', id }, EMAIL)
    openCallbackPage(googleAnswers(browser.tabs[0]))
    await expectNothingSaved(id, attempt, /didn’t expect/)
  })

  it('the project was deleted meanwhile', async () => {
    const attempt = docs.makeDoc({ kind: 'project', id: 'gone' }, EMAIL)
    openCallbackPage(googleAnswers(browser.tabs[0]))
    await expect(attempt).rejects.toThrow(/no longer exists/)
    expect(drive.calls).toEqual([])
  })

  it('the tab comes back from Google but no app tab is waiting for it', async () => {
    const page = openCallbackPage(googleAnswers(`https://accounts.google.com/?state=unknown`))
    for (let i = 0; i < 6; i++) page.ticks[0]?.()
    expect(page.shown.at(-1)).toMatch(/isn't answering/)
    expect(page.went).toEqual([])
  })
})

describe('in the Home Screen app, the app itself goes to Google and back', () => {
  beforeEach(() => {
    browser.isStandalone = true
  })

  it('leaves for Google, comes back to the callback page, and finishes the doc', async () => {
    const id = await newProject()
    expect(await docs.makeDoc({ kind: 'project', id }, EMAIL)).toBe('leaving')
    expect(browser.tabs).toEqual([])
    const google = new URL(browser.left[0])
    expect(google.searchParams.get('redirect_uri')).toBe(CALLBACK)
    expect(JSON.parse(browser.storage.items.get(LEAVING_KEY)!)).toEqual({
      state: google.searchParams.get('state'),
      target: { kind: 'project', id },
      email: EMAIL,
    })

    // Same window, so the same sessionStorage.
    const page = openCallbackPage(googleAnswers(browser.left[0]), browser.storage)
    expect(page.went).toEqual([APP])
    expect(browser.storage.items.has(LEAVING_KEY)).toBe(false)
    expect(browser.storage.items.has(RETURNING_KEY)).toBe(true)

    expect(await docs.resume(EMAIL)).toEqual({ target: { kind: 'project', id }, docId: 'doc-1' })
    expect((await getProject(id))?.docId).toBe('doc-1')
    expect(browser.storage.items.has(RETURNING_KEY)).toBe(false)
    expect(await docs.resume(EMAIL)).toBeNull()

    // Now with the token in hand, no trip: made here.
    expect(await docs.makeDoc({ kind: 'project', id }, EMAIL)).toBe('made')
    expect(browser.left).toHaveLength(1)
    expect((await getProject(id))?.docId).toBe('doc-2')
  })

  it('refused on the way: says so when back, and saves nothing', async () => {
    const id = await newProject()
    await docs.makeDoc({ kind: 'project', id }, EMAIL)
    openCallbackPage(googleAnswers(browser.left[0], { error: 'access_denied' }), browser.storage)
    await expect(docs.resume(EMAIL)).rejects.toThrow(/wasn't allowed/)
    expect(await getProject(id)).not.toHaveProperty('docId')
  })

  it('back as another account: leaves it alone', async () => {
    const id = await newProject()
    await docs.makeDoc({ kind: 'project', id }, EMAIL)
    openCallbackPage(googleAnswers(browser.left[0]), browser.storage)
    expect(await docs.resume('someone@example.com')).toBeNull()
    expect(drive.calls).toEqual([])
  })
})
