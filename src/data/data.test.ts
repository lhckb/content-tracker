import { beforeEach, describe, expect, it } from 'vitest'
import {
  addSubtask,
  archiveProject,
  BackupError,
  clearAllData,
  createProject,
  deleteProject,
  deleteSubtask,
  exportBackupText,
  getProject,
  getSubtasks,
  getTrackerData,
  importBackupText,
  moveSubtask,
  restoreProject,
  setProjectColor,
  setPublishDate,
  shiftProject,
  updateSubtask,
  type NewProject,
} from '.'

const PUBLISH = '2026-11-14'

function newProject(fields: Partial<NewProject> = {}): Promise<string> {
  return createProject({
    title: 'Morning routine vlog',
    platform: 'youtube',
    publishDate: PUBLISH,
    withDefaultSubtasks: true,
    ...fields,
  })
}

async function subtaskNamed(projectId: string, title: string) {
  const found = (await getSubtasks(projectId)).find((s) => s.title === title)
  if (!found) throw new Error(`No subtask ${title}`)
  return found
}

beforeEach(async () => {
  await clearAllData()
})

describe('createProject', () => {
  it('adds the default subtasks one per day before the publish date', async () => {
    const id = await newProject()
    const subtasks = await getSubtasks(id)
    expect(subtasks.map((s) => [s.title, s.start, s.kind])).toEqual([
      ['Script', '2026-11-09', 'task'],
      ['A-roll', '2026-11-10', 'task'],
      ['B-roll', '2026-11-11', 'task'],
      ['Edit', '2026-11-12', 'task'],
      ['Thumbnail', '2026-11-13', 'task'],
      ['Publish', PUBLISH, 'publish'],
    ])
  })

  it('always adds a Publish subtask', async () => {
    const id = await newProject({ withDefaultSubtasks: false })
    const subtasks = await getSubtasks(id)
    expect(subtasks.map((s) => s.kind)).toEqual(['publish'])
  })

  it('gives each active project its own color, freeing it on archive', async () => {
    const first = await newProject()
    await newProject()
    await newProject()
    const { projects } = await getTrackerData()
    expect(projects.map((p) => p.color).sort()).toEqual(['blue', 'green', 'orange'])

    await archiveProject(first)
    const fourth = await getProject(await newProject())
    expect(fourth?.color).toBe('blue')
  })
})

describe('setProjectColor', () => {
  it("refuses another active project's color", async () => {
    await newProject()
    const second = await newProject()
    expect(await setProjectColor(second, 'blue')).toEqual({ ok: false, reason: 'color-taken' })
    expect(await setProjectColor(second, 'pink')).toEqual({ ok: true })
    expect((await getProject(second))?.color).toBe('pink')
  })
})

describe('setPublishDate', () => {
  it('moves the Publish subtask with it and leaves other subtasks alone', async () => {
    const id = await newProject()
    expect(await setPublishDate(id, '2026-11-20')).toEqual({ ok: true })
    expect((await getProject(id))?.publishDate).toBe('2026-11-20')
    expect((await subtaskNamed(id, 'Publish')).start).toBe('2026-11-20')
    expect((await subtaskNamed(id, 'Thumbnail')).start).toBe('2026-11-13')
  })

  it('refuses a date before a task ends and names the tasks in the way', async () => {
    const id = await newProject()
    const result = await setPublishDate(id, '2026-11-11')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.tasks.map((s) => s.title)).toEqual(['Edit', 'Thumbnail'])
    expect((await getProject(id))?.publishDate).toBe(PUBLISH)
  })
})

describe('moveSubtask', () => {
  it('turns a single day into a range and back', async () => {
    const id = await newProject()
    const edit = await subtaskNamed(id, 'Edit')

    await moveSubtask(edit.id, { start: '2026-11-05', end: '2026-11-06' })
    expect(await subtaskNamed(id, 'Edit')).toMatchObject({ start: '2026-11-05', end: '2026-11-06' })

    await moveSubtask(edit.id, { start: '2026-11-07' })
    const moved = await subtaskNamed(id, 'Edit')
    expect(moved.start).toBe('2026-11-07')
    expect('end' in moved).toBe(false)
  })

  it('refuses to end after the publish date', async () => {
    const id = await newProject()
    const edit = await subtaskNamed(id, 'Edit')
    const result = await moveSubtask(edit.id, { start: '2026-11-13', end: '2026-11-16' })
    expect(result).toEqual({
      ok: false,
      reason: 'ends-after-publish',
      publishDate: PUBLISH,
      endsOn: '2026-11-16',
    })
    expect((await subtaskNamed(id, 'Edit')).start).toBe('2026-11-12')
  })

  it('pushes the publish date out when asked', async () => {
    const id = await newProject()
    const edit = await subtaskNamed(id, 'Edit')
    const result = await moveSubtask(
      edit.id,
      { start: '2026-11-13', end: '2026-11-16' },
      { pushPublishDate: true },
    )
    expect(result).toEqual({ ok: true })
    expect((await getProject(id))?.publishDate).toBe('2026-11-16')
    expect((await subtaskNamed(id, 'Publish')).start).toBe('2026-11-16')
  })

  it("won't move Publish on its own", async () => {
    const id = await newProject()
    const publish = await subtaskNamed(id, 'Publish')
    await expect(moveSubtask(publish.id, { start: '2026-11-10' })).rejects.toThrow()
  })
})

describe('addSubtask', () => {
  it('applies the guard rail', async () => {
    const id = await newProject({ withDefaultSubtasks: false })
    const refused = await addSubtask(id, { title: 'Late', start: '2026-11-15' })
    expect(refused.ok).toBe(false)

    const added = await addSubtask(id, { title: 'Color grade', start: '2026-11-10', end: '2026-11-11' })
    expect(added.ok).toBe(true)
    expect((await getSubtasks(id)).map((s) => s.title)).toEqual(['Color grade', 'Publish'])
  })
})

describe('shiftProject', () => {
  it('moves every subtask, done or not, and the publish date', async () => {
    const id = await newProject()
    const script = await subtaskNamed(id, 'Script')
    await updateSubtask(script.id, { done: true })

    await shiftProject(id, 3)
    expect((await getProject(id))?.publishDate).toBe('2026-11-17')
    expect((await getSubtasks(id)).map((s) => s.start)).toEqual([
      '2026-11-12',
      '2026-11-13',
      '2026-11-14',
      '2026-11-15',
      '2026-11-16',
      '2026-11-17',
    ])
  })
})

describe('restoreProject', () => {
  it('takes a free color if its old one was taken meanwhile', async () => {
    const id = await newProject()
    await archiveProject(id)
    await newProject() // takes blue
    await restoreProject(id)
    const restored = await getProject(id)
    expect(restored).toMatchObject({ archived: false, color: 'green' })
  })
})

describe('deleting', () => {
  it('removes a project with its subtasks', async () => {
    const id = await newProject()
    await newProject()
    await deleteProject(id)
    const { projects, subtasks } = await getTrackerData()
    expect(projects).toHaveLength(1)
    expect(subtasks.every((s) => s.projectId === projects[0].id)).toBe(true)
  })

  it("won't delete or rename Publish", async () => {
    const id = await newProject()
    const publish = await subtaskNamed(id, 'Publish')
    await expect(deleteSubtask(publish.id)).rejects.toThrow()
    await expect(updateSubtask(publish.id, { title: 'Go live' })).rejects.toThrow()
  })
})

describe('backup', () => {
  it('round-trips everything through export and import', async () => {
    const id = await newProject()
    await moveSubtask((await subtaskNamed(id, 'Edit')).id, {
      start: '2026-11-11',
      end: '2026-11-12',
    })
    await archiveProject(await newProject({ title: 'Old one', platform: 'instagram' }))
    const before = await getTrackerData()

    const text = await exportBackupText()
    await clearAllData()
    expect(await importBackupText(text)).toEqual({ projects: 2, subtasks: 12 })

    const after = await getTrackerData()
    const byId = <T extends { id: string }>(a: T, b: T) => a.id.localeCompare(b.id)
    expect(after.projects.sort(byId)).toEqual(before.projects.sort(byId))
    expect(after.subtasks.sort(byId)).toEqual(before.subtasks.sort(byId))
  })

  it('rejects a bad file and keeps the current data', async () => {
    await newProject()
    await expect(importBackupText('not json')).rejects.toThrow(BackupError)
    await expect(importBackupText('{"app":"other"}')).rejects.toThrow(BackupError)

    const backup = JSON.parse(await exportBackupText())
    backup.subtasks = backup.subtasks.filter((s: { kind: string }) => s.kind !== 'publish')
    await expect(importBackupText(JSON.stringify(backup))).rejects.toThrow(
      /exactly one Publish subtask/,
    )

    expect((await getTrackerData()).projects).toHaveLength(1)
  })

  it('refuses files from a newer version of the app', async () => {
    const backup = JSON.parse(await exportBackupText())
    backup.schemaVersion = 2
    await expect(importBackupText(JSON.stringify(backup))).rejects.toThrow(/version 2/)
  })
})
