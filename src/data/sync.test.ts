import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createProject, deleteProject, getProject, getSubtasks, updateProject } from '.'
import { db, deleteAccountSpace, switchSpace } from './db'
import { FakeSyncServer } from './fakeSyncServer'
import type { ProjectRow } from './remote'
import { getSyncStatus, startSync, type SyncEngine } from './sync'

const USER = 'user-1'
let server: FakeSyncServer
let engine: SyncEngine

// Long delays, so only the tests' own syncNow() calls run a sync.
const QUIET = { debounceMs: 60_000, pollMs: 60_000, retryMs: 60_000 }

function newProject(title = 'Morning routine vlog') {
  return createProject({ title, platform: 'youtube', publishDate: '2026-11-14', withDefaultSubtasks: false })
}

function serverProject(id: string, fields: Partial<ProjectRow>): ProjectRow {
  return {
    id,
    title: 'From another device',
    platform: 'instagram',
    color: 'green',
    publish_date: '2026-11-20',
    notes: '',
    archived: false,
    deleted: false,
    edited_at: '2026-10-27T13:00:00.000Z',
    ...fields,
  }
}

beforeEach(async () => {
  await deleteAccountSpace(USER)
  switchSpace({ kind: 'account', userId: USER })
  server = new FakeSyncServer()
  engine = startSync(server, QUIET)
  await engine.syncNow()
})

afterEach(() => {
  engine.stop()
  switchSpace({ kind: 'guest' })
})

describe('pushing', () => {
  it('sends local changes and forgets them once the server has them', async () => {
    const id = await newProject()
    await engine.syncNow()
    expect(server.projects.get(id)).toMatchObject({ title: 'Morning routine vlog', deleted: false })
    expect([...server.subtasks.values()].map((s) => s.kind)).toEqual(['publish'])
    expect(await db.pending.count()).toBe(0)
    expect(getSyncStatus().state).toBe('synced')
  })

  it('sends deletes as tombstones', async () => {
    const id = await newProject()
    await engine.syncNow()
    await deleteProject(id)
    await engine.syncNow()
    expect(server.projects.get(id)?.deleted).toBe(true)
    expect([...server.subtasks.values()].every((s) => s.deleted)).toBe(true)
  })

  it('keeps an edit made while a push is in flight, and sends it next time', async () => {
    const id = await newProject()
    let release = () => {}
    server.pushGate = new Promise((resolve) => (release = resolve))
    const syncing = engine.syncNow()
    await new Promise((resolve) => setTimeout(resolve, 20))
    await updateProject(id, { title: 'Edited mid-push' })
    release()
    await syncing
    server.pushGate = null
    expect(await db.pending.get(`projects:${id}`)).toBeTruthy()

    await engine.syncNow()
    expect(server.projects.get(id)?.title).toBe('Edited mid-push')
  })
})

describe('pulling', () => {
  it('brings in another device’s changes without sending them back', async () => {
    server.editFromAnotherDevice({ projects: [serverProject('p-remote', {})] })
    await engine.syncNow()
    expect(await getProject('p-remote')).toMatchObject({ title: 'From another device', platform: 'instagram' })
    expect(await db.pending.count()).toBe(0)
  })

  it('removes records another device deleted', async () => {
    const id = await newProject()
    await engine.syncNow()
    server.editFromAnotherDevice({
      projects: [{ ...server.projects.get(id)!, deleted: true, edited_at: '2099-01-01T00:00:00.000Z' }],
    })
    await engine.syncNow()
    expect(await getProject(id)).toBeUndefined()
  })

  it('ends up with the newest edit when two devices edit the same project', async () => {
    const id = await newProject()
    await engine.syncNow()
    // Another device edits it later than this one will.
    server.editFromAnotherDevice({
      projects: [{ ...server.projects.get(id)!, title: 'Newer, elsewhere', edited_at: '2099-01-01T00:00:00.000Z' }],
    })
    await updateProject(id, { title: 'Older, here' })
    await engine.syncNow()
    expect(server.projects.get(id)?.title).toBe('Newer, elsewhere')
    expect((await getProject(id))?.title).toBe('Newer, elsewhere')
  })

  it('asks only for what changed since the last pull, with some overlap', async () => {
    server.editFromAnotherDevice({ projects: [serverProject('p-remote', {})] })
    await engine.syncNow()
    const lastUpdate = server.projects.get('p-remote')?.updated_at ?? ''
    await engine.syncNow()
    const since = server.pulls.at(-1) ?? ''
    expect(Date.parse(since)).toBeLessThan(Date.parse(lastUpdate))
    expect(Date.parse(lastUpdate) - Date.parse(since)).toBe(2 * 60_000)
  })

  it('repairs a Publish subtask that drifted from its project, and syncs the fix', async () => {
    const id = await newProject()
    await engine.syncNow()
    // Another device's publish-date change arrived without its Publish subtask.
    server.editFromAnotherDevice({
      projects: [{ ...server.projects.get(id)!, publish_date: '2026-11-21', edited_at: '2099-01-01T00:00:00.000Z' }],
    })
    await engine.syncNow()
    const [publish] = await getSubtasks(id)
    expect(publish.start).toBe('2026-11-21')
    await engine.syncNow()
    expect(server.subtasks.get(publish.id)?.start_date).toBe('2026-11-21')
  })
})

describe('trouble', () => {
  it('keeps changes when the server is unreachable, and sends them once it’s back', async () => {
    server.unreachable = true
    const id = await newProject()
    await engine.syncNow()
    expect(getSyncStatus()).toMatchObject({ state: 'error' })
    expect(await db.pending.count()).toBeGreaterThan(0)

    server.unreachable = false
    await engine.syncNow()
    expect(server.projects.get(id)).toBeTruthy()
    expect(getSyncStatus().state).toBe('synced')
  })

  it('syncs on its own when another device announces a change', async () => {
    engine.stop()
    engine = startSync(server, { debounceMs: 10, pollMs: 60_000, retryMs: 60_000 })
    await engine.syncNow()
    server.editFromAnotherDevice({ projects: [serverProject('p-live', {})] })
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(await getProject('p-live')).toBeTruthy()
  })

  it('pushes on its own shortly after a local change', async () => {
    engine.stop()
    engine = startSync(server, { debounceMs: 10, pollMs: 60_000, retryMs: 60_000 })
    await engine.syncNow()
    const id = await newProject()
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(server.projects.get(id)).toBeTruthy()
  })
})
