import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  addIdea,
  addSubtask,
  createProject,
  deleteIdea,
  deleteProject,
  getIdeas,
  getProject,
  getSubtasks,
  makeProjectFromIdea,
  setCleanup,
  updateIdea,
  updateProject,
} from '.'
import { db, deleteAccountSpace, switchSpace } from './db'
import { FakeSyncServer } from './fakeSyncServer'
import type { IdeaRow, ProjectRow, Rows } from './remote'
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

function serverIdea(id: string, fields: Partial<IdeaRow>): IdeaRow {
  return {
    id,
    title: 'Idea from another device',
    platform: 'youtube',
    description: '',
    month: null,
    created_at: '2026-10-27T13:00:00.000Z',
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

describe('clean-up tasks', () => {
  it('go up with their kind, come back the same, and switch kinds across devices', async () => {
    const id = await newProject()
    const added = await addSubtask(id, { title: 'Back up raw footage', start: '2026-11-16', kind: 'cleanup' })
    if (!added.ok) throw new Error('not added')
    await engine.syncNow()
    expect(server.subtasks.get(added.id)).toMatchObject({ kind: 'cleanup', start_date: '2026-11-16' })

    // Another device turns it back into a regular task, ending on Publish,
    // just after this device's edit.
    const sent = server.subtasks.get(added.id)!
    const later = new Date(Date.parse(sent.edited_at) + 1).toISOString()
    server.editFromAnotherDevice({
      subtasks: [{ ...sent, kind: 'task', start_date: '2026-11-14', edited_at: later }],
    })
    await engine.syncNow()
    expect((await getSubtasks(id)).find((s) => s.id === added.id)).toMatchObject({ kind: 'task', start: '2026-11-14' })

    // Then this device makes it clean-up again, later.
    await new Promise((resolve) => setTimeout(resolve, 5))
    await setCleanup(added.id, true)
    await engine.syncNow()
    expect(server.subtasks.get(added.id)?.kind).toBe('cleanup')
  })
})

describe('ideas', () => {
  it('sends new ideas, edits and deletes', async () => {
    const id = await addIdea({ title: 'Studio tour', platform: 'instagram', month: '2027-03' })
    await engine.syncNow()
    expect(server.ideas.get(id)).toMatchObject({ title: 'Studio tour', month: '2027-03', deleted: false })

    await updateIdea(id, { month: undefined, description: 'New shelves' })
    await engine.syncNow()
    expect(server.ideas.get(id)).toMatchObject({ month: null, description: 'New shelves' })

    await deleteIdea(id)
    await engine.syncNow()
    expect(server.ideas.get(id)?.deleted).toBe(true)
    expect(await db.pending.count()).toBe(0)
  })

  it('brings in another device’s ideas, and removes the ones it deleted', async () => {
    server.editFromAnotherDevice({ ideas: [serverIdea('i-remote', { month: '2026-12' })] })
    await engine.syncNow()
    expect(await getIdeas()).toEqual([
      {
        id: 'i-remote',
        title: 'Idea from another device',
        platform: 'youtube',
        description: '',
        month: '2026-12',
        createdAt: '2026-10-27T13:00:00.000Z',
      },
    ])
    expect(await db.pending.count()).toBe(0)

    server.editFromAnotherDevice({
      ideas: [serverIdea('i-remote', { deleted: true, edited_at: '2099-01-01T00:00:00.000Z' })],
    })
    await engine.syncNow()
    expect(await getIdeas()).toEqual([])
  })

  it('sends a project made from an idea and the idea’s removal in one push', async () => {
    const ideaId = await addIdea({ title: 'Studio tour', platform: 'youtube' })
    await engine.syncNow()
    const batches: Rows[] = []
    const push = server.push.bind(server)
    server.push = async (rows) => {
      batches.push(rows)
      return push(rows)
    }

    const projectId = await makeProjectFromIdea(ideaId, {
      title: 'Studio tour',
      platform: 'youtube',
      publishDate: '2027-03-20',
      withDefaultSubtasks: true,
    })
    await engine.syncNow()
    expect(batches).toHaveLength(1)
    expect(batches[0].projects.map((p) => p.id)).toEqual([projectId])
    expect(batches[0].subtasks).toHaveLength(6)
    expect(batches[0].ideas).toMatchObject([{ id: ideaId, deleted: true }])
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
