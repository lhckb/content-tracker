import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  addIdea,
  archiveProject,
  clearAllData,
  createProject,
  deleteIdea,
  deleteProject,
  exportBackupText,
  getIdeas,
  getSubtasks,
  getTrackerData,
  importBackupText,
  updateIdea,
} from '.'
import { applyingRemote, db, deleteAccountSpace, switchSpace } from './db'
import { copyGuestData, countGuestData } from './guest'

const ACCOUNT = { kind: 'account', userId: 'user-1' } as const

function newProject(title = 'Morning routine vlog') {
  return createProject({
    title,
    platform: 'youtube',
    publishDate: '2026-11-14',
    withDefaultSubtasks: false,
  })
}

const pendingKeys = async () => (await db.pending.toArray()).map((p) => p.key).sort()

beforeEach(async () => {
  switchSpace({ kind: 'guest' })
  await clearAllData()
  await deleteAccountSpace(ACCOUNT.userId)
})

afterEach(() => {
  switchSpace({ kind: 'guest' })
})

describe('spaces', () => {
  it('keeps guest and account projects apart', async () => {
    await newProject('Guest project')
    switchSpace(ACCOUNT)
    await newProject('Account project')
    expect((await getTrackerData()).projects.map((p) => p.title)).toEqual(['Account project'])

    switchSpace({ kind: 'guest' })
    expect((await getTrackerData()).projects.map((p) => p.title)).toEqual(['Guest project'])
  })

  it('keeps guest and account ideas apart', async () => {
    await addIdea({ title: 'Guest idea', platform: 'youtube' })
    switchSpace(ACCOUNT)
    expect(await getIdeas()).toEqual([])
    switchSpace({ kind: 'guest' })
    expect((await getIdeas()).map((i) => i.title)).toEqual(['Guest idea'])
  })

  it('removes an account from the device on sign-out, leaving the guest space', async () => {
    await newProject('Guest project')
    switchSpace(ACCOUNT)
    await newProject('Account project')
    await deleteAccountSpace(ACCOUNT.userId)
    expect((await getTrackerData()).projects.map((p) => p.title)).toEqual(['Guest project'])

    switchSpace(ACCOUNT)
    expect((await getTrackerData()).projects).toEqual([])
  })
})

describe('copying guest projects and ideas into the account', () => {
  it('copies them with their ids and records them for syncing', async () => {
    const id = await newProject('Made while signed out')
    const ideaId = await addIdea({ title: 'Jotted down while signed out', platform: 'instagram' })
    switchSpace(ACCOUNT)
    expect(await countGuestData()).toEqual({ projects: 1, ideas: 1 })
    expect(await copyGuestData()).toEqual({ projects: 1, ideas: 1 })

    expect((await getTrackerData()).projects.map((p) => p.id)).toEqual([id])
    expect((await getIdeas()).map((i) => i.id)).toEqual([ideaId])
    expect(await pendingKeys()).toContain(`projects:${id}`)
    expect(await pendingKeys()).toContain(`ideas:${ideaId}`)
    switchSpace({ kind: 'guest' })
    expect((await getTrackerData()).projects).toHaveLength(1)
    expect(await getIdeas()).toHaveLength(1)
  })

  it('gives a copied project a free color if the account already uses its color', async () => {
    await newProject('Guest')
    switchSpace(ACCOUNT)
    await newProject('Already in the account')
    await copyGuestData()
    const colors = (await getTrackerData()).projects.map((p) => p.color).sort()
    expect(colors).toEqual(['blue', 'green'])
  })
})

describe('change recording', () => {
  it('records nothing in the guest space', async () => {
    await newProject()
    expect(await db.pending.count()).toBe(0)
  })

  it('records every created record in an account space', async () => {
    switchSpace(ACCOUNT)
    const id = await newProject()
    const [publish] = await getSubtasks(id)
    expect(await pendingKeys()).toEqual([`projects:${id}`, `subtasks:${publish.id}`])
  })

  it('moves a change forward in time when the record changes again', async () => {
    switchSpace(ACCOUNT)
    const id = await newProject()
    const before = (await db.pending.get(`projects:${id}`))?.editedAt ?? ''
    await new Promise((resolve) => setTimeout(resolve, 5))
    await archiveProject(id)
    const after = (await db.pending.get(`projects:${id}`))?.editedAt ?? ''
    expect(after > before).toBe(true)
  })

  it('stamps changes in quick succession with strictly later times', async () => {
    switchSpace(ACCOUNT)
    const id = await addIdea({ title: 'Studio tour', platform: 'youtube' })
    const stamps: string[] = []
    for (const description of ['a', 'b', 'c']) {
      await updateIdea(id, { description })
      stamps.push((await db.pending.get(`ideas:${id}`))?.editedAt ?? '')
    }
    expect(stamps[0] < stamps[1] && stamps[1] < stamps[2]).toBe(true)
  })

  it('keeps a deleted record’s last values, for the tombstone', async () => {
    switchSpace(ACCOUNT)
    const id = await newProject()
    await deleteProject(id)
    const change = await db.pending.get(`projects:${id}`)
    expect(change?.deleted).toMatchObject({ id, title: 'Morning routine vlog' })
    const subtaskChanges = (await db.pending.toArray()).filter((p) => p.table === 'subtasks')
    expect(subtaskChanges.every((p) => p.deleted)).toBe(true)
  })

  it('records every change to an idea, keeping its last values when deleted', async () => {
    switchSpace(ACCOUNT)
    const id = await addIdea({ title: 'Studio tour', platform: 'youtube' })
    expect(await pendingKeys()).toEqual([`ideas:${id}`])
    await db.pending.clear()
    await updateIdea(id, { description: 'Show the new shelves' })
    expect(await pendingKeys()).toEqual([`ideas:${id}`])
    await deleteIdea(id)
    expect((await db.pending.get(`ideas:${id}`))?.deleted).toMatchObject({
      id,
      description: 'Show the new shelves',
    })
  })

  it('does not record changes that came from the server', async () => {
    switchSpace(ACCOUNT)
    const id = await newProject()
    await db.pending.clear()
    await applyingRemote(async () => {
      await db.projects.update(id, { title: 'Renamed on another device' })
    })
    expect(await db.pending.count()).toBe(0)
    expect((await db.projects.get(id))?.title).toBe('Renamed on another device')
  })

  it('records a tombstone for every replaced record when a backup is imported', async () => {
    switchSpace(ACCOUNT)
    const old = await newProject('Old project')
    switchSpace({ kind: 'guest' })
    await newProject('From the backup')
    const backup = await exportBackupText()

    switchSpace(ACCOUNT)
    await db.pending.clear()
    await importBackupText(backup)
    expect((await db.pending.get(`projects:${old}`))?.deleted).toBeTruthy()
    expect((await getTrackerData()).projects.map((p) => p.title)).toEqual(['From the backup'])
  })
})
