import { beforeEach, describe, expect, it } from 'vitest'
import { addIdea, clearAllData, createProject, getIdeas, getProject } from '.'
import {
  DRIVE_FILE_SCOPE,
  FOLDER_NAME,
  GoogleDocsError,
  makeGoogleDocs,
  type GoogleDocs,
  type OAuth2,
  type TokenClientConfig,
  type TokenResponse,
} from './googleDocs'

const EMAIL = 'luis@example.com'
const FOLDER_TYPE = 'application/vnd.google-apps.folder'
const DOC_TYPE = 'application/vnd.google-apps.document'

// Stands in for google.accounts.oauth2: each token request "opens Google's
// window" and answers with `answer`, a granted token by default.
class FakeOAuth2 implements OAuth2 {
  requests: TokenClientConfig[] = []
  answer: (config: TokenClientConfig) => void = (config) =>
    config.callback({ access_token: `token-${this.requests.length}`, expires_in: 3599, scope: DRIVE_FILE_SCOPE })

  initTokenClient(config: TokenClientConfig) {
    return {
      requestAccessToken: () => {
        this.requests.push(config)
        this.answer(config)
      },
    }
  }

  hasGrantedAllScopes(response: TokenResponse, ...scopes: string[]) {
    const granted = (response.scope ?? '').split(' ')
    return scopes.every((scope) => granted.includes(scope))
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

let oauth2: FakeOAuth2
let drive: FakeDrive
let clock: number
let loads: number
let docs: GoogleDocs

function newProject(notes = 'Hook: the 5am alarm\nShots: desk, coffee, window') {
  return createProject({
    title: 'Morning routine vlog',
    platform: 'youtube',
    publishDate: '2026-11-14',
    withDefaultSubtasks: false,
    notes,
  })
}

beforeEach(async () => {
  await clearAllData()
  oauth2 = new FakeOAuth2()
  drive = new FakeDrive()
  clock = Date.parse('2026-11-05T12:00:00Z')
  loads = 0
  docs = makeGoogleDocs({
    clientId: 'client-123.apps.googleusercontent.com',
    loadOAuth2: async () => {
      loads += 1
      return oauth2
    },
    fetch: drive.fetch,
    now: () => clock,
  })
})

describe('making a doc', () => {
  it('asks Google for drive.file access for the signed-in account', async () => {
    await docs.createProjectDoc(await newProject(), EMAIL)
    expect(oauth2.requests).toHaveLength(1)
    expect(oauth2.requests[0]).toMatchObject({
      client_id: 'client-123.apps.googleusercontent.com',
      scope: 'https://www.googleapis.com/auth/drive.file',
      login_hint: EMAIL,
      prompt: '',
    })
  })

  it('makes the folder, then the doc in it with the notes, and remembers the doc', async () => {
    const id = await newProject()
    expect(await docs.createProjectDoc(id, EMAIL)).toBe('doc-1')

    const [search, folder, upload] = drive.calls
    expect(search.method).toBe('GET')
    expect(search.url.searchParams.get('q')).toBe(
      `mimeType = '${FOLDER_TYPE}' and name = '${FOLDER_NAME}' and trashed = false`,
    )
    expect(search.headers.Authorization).toBe('Bearer token-1')
    expect(folder.method).toBe('POST')
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
    expect((await getProject(id))?.docId).toBe('doc-1')
  })

  it('reuses the folder and the token for the next doc', async () => {
    await docs.createProjectDoc(await newProject(), EMAIL)
    expect(docs.hasToken(EMAIL)).toBe(true)
    drive.calls = []
    await docs.createProjectDoc(await newProject(), EMAIL)
    expect(oauth2.requests).toHaveLength(1)
    expect(drive.calls.map((c) => c.method)).toEqual(['GET', 'POST'])
    expect(parts(drive.calls[1]).metadata.parents).toEqual(['folder-1'])
    expect(loads).toBe(1)
  })

  it('makes an empty doc from empty notes, still in the folder', async () => {
    const id = await newProject('  \n')
    await docs.createProjectDoc(id, EMAIL)
    const [made] = drive.docCalls()
    expect(made.url.pathname).toBe('/drive/v3/files')
    expect(JSON.parse(made.body!)).toEqual({ name: 'Morning routine vlog', mimeType: DOC_TYPE, parents: ['folder-1'] })
    expect((await getProject(id))?.docId).toBe('doc-1')
  })

  it('keeps accents, emoji and line breaks in the text', async () => {
    const notes = 'Café ☕️ às 5h\n\n– roteiro'
    await docs.createProjectDoc(await newProject(notes), EMAIL)
    expect(parts(drive.docCalls()[0]).text).toBe(notes)
  })

  it('makes a doc from an idea’s description', async () => {
    const id = await addIdea({ title: 'Studio tour', platform: 'instagram', description: 'New shelves' })
    await docs.createIdeaDoc(id, EMAIL)
    const { metadata, text } = parts(drive.docCalls()[0])
    expect(metadata.name).toBe('Studio tour')
    expect(text).toBe('New shelves')
    expect((await getIdeas())[0].docId).toBe('doc-1')
  })

  it('replaces the remembered doc when asked for a new copy', async () => {
    const id = await newProject()
    await docs.createProjectDoc(id, EMAIL)
    await docs.createProjectDoc(id, EMAIL)
    expect((await getProject(id))?.docId).toBe('doc-2')
  })
})

describe('the token', () => {
  it('is asked for again once it’s about to run out', async () => {
    const id = await newProject()
    await docs.createProjectDoc(id, EMAIL)
    clock += 3599_000 - 61_000
    expect(docs.hasToken(EMAIL)).toBe(true)
    clock += 2_000
    expect(docs.hasToken(EMAIL)).toBe(false)
    await docs.createProjectDoc(id, EMAIL)
    expect(oauth2.requests).toHaveLength(2)
  })

  it('belongs to one account, and is dropped on sign-out', async () => {
    const id = await newProject()
    await docs.createProjectDoc(id, EMAIL)
    expect(docs.hasToken('someone@example.com')).toBe(false)
    docs.forget()
    expect(docs.hasToken(EMAIL)).toBe(false)
    await docs.createProjectDoc(id, EMAIL)
    expect(oauth2.requests).toHaveLength(2)
  })
})

describe('when it goes wrong, nothing is saved', () => {
  async function expectNothingSaved(projectId: string, message: RegExp) {
    const attempt = docs.createProjectDoc(projectId, EMAIL)
    await expect(attempt).rejects.toThrow(GoogleDocsError)
    await expect(attempt).rejects.toThrow(message)
    expect(await getProject(projectId)).not.toHaveProperty('docId')
  }

  it('Google’s window is closed or blocked', async () => {
    const id = await newProject()
    oauth2.answer = (config) => config.error_callback?.({ type: 'popup_closed' })
    await expectNothingSaved(id, /window was closed/)
    oauth2.answer = (config) => config.error_callback?.({ type: 'popup_failed_to_open' })
    await expectNothingSaved(id, /blocked Google's window/)
    expect(drive.calls).toEqual([])
  })

  it('access is refused, or given without Drive', async () => {
    const id = await newProject()
    oauth2.answer = (config) => config.callback({ error: 'access_denied' })
    await expectNothingSaved(id, /wasn't allowed/)
    oauth2.answer = (config) => config.callback({ access_token: 't', expires_in: 3599, scope: 'email profile' })
    await expectNothingSaved(id, /needs permission/)
    expect(docs.hasToken(EMAIL)).toBe(false)
  })

  it('Google’s script doesn’t load, and loads on the next try', async () => {
    let fail = true
    docs = makeGoogleDocs({
      clientId: 'client-123',
      loadOAuth2: async () => {
        loads += 1
        if (fail) throw new GoogleDocsError("Couldn't reach Google. Check your connection and try again.")
        return oauth2
      },
      fetch: drive.fetch,
      now: () => clock,
    })
    const id = await newProject()
    await expectNothingSaved(id, /Couldn't reach Google/)
    fail = false
    await docs.createProjectDoc(id, EMAIL)
    expect(loads).toBe(2)
  })

  it('offline', async () => {
    const id = await newProject()
    drive.fail = () => new TypeError('Failed to fetch')
    await expectNothingSaved(id, /Couldn't reach Google Drive/)
  })

  it('Drive refuses, with Google’s reason', async () => {
    const id = await newProject()
    drive.fail = (call) =>
      call.url.pathname.startsWith('/upload')
        ? json({ error: { code: 403, message: 'Google Drive API has not been used in project 123' } }, 403)
        : undefined
    await expectNothingSaved(id, /Google Drive refused: Google Drive API has not been used/)
  })

  it('the token stopped working: dropped, so the next try asks Google again', async () => {
    const id = await newProject()
    drive.fail = () => json({ error: { code: 401, message: 'Invalid Credentials' } }, 401)
    await expectNothingSaved(id, /sign in again/)
    expect(docs.hasToken(EMAIL)).toBe(false)
    drive.fail = null
    await docs.createProjectDoc(id, EMAIL)
    expect(oauth2.requests).toHaveLength(2)
  })

  it('Drive answers with something that isn’t a file id', async () => {
    const id = await newProject()
    drive.fail = (call) => (call.url.pathname.startsWith('/upload') ? json({ id: '../elsewhere' }) : undefined)
    await expectNothingSaved(id, /didn’t expect/)
  })

  it('the project was deleted meanwhile', async () => {
    await expect(docs.createProjectDoc('gone', EMAIL)).rejects.toThrow(/no longer exists/)
    expect(drive.calls).toEqual([])
  })
})
