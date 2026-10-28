import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAllData, createProject, getProject, getSubtasks } from '../data'
import { getProgress } from '../lib/progress'
import { addTask, movePublishDate, moveTask, setCleanupKind, setDone } from './actions'

const confirm = vi.fn<(message: string) => boolean>()

beforeEach(async () => {
  await clearAllData()
  vi.stubGlobal('confirm', confirm)
})

afterEach(() => {
  vi.unstubAllGlobals()
  confirm.mockReset()
})

async function sampleProject(withDefaultCleanup = false) {
  const id = await createProject({
    title: 'Morning routine vlog',
    platform: 'youtube',
    publishDate: '2026-11-14',
    withDefaultSubtasks: true,
    withDefaultCleanup,
  })
  const subtasks = await getSubtasks(id)
  const named = (title: string) => subtasks.find((s) => s.title === title)!
  return { id, named }
}

describe('moveTask', () => {
  it("moves without asking when it's before the publish date", async () => {
    const { named } = await sampleProject()
    expect(await moveTask(named('Edit'), { start: '2026-11-10', end: '2026-11-12' })).toBe(true)
    expect(confirm).not.toHaveBeenCalled()
  })

  it('asks before pushing the publish date, and leaves everything if declined', async () => {
    const { id, named } = await sampleProject()
    confirm.mockReturnValue(false)
    expect(await moveTask(named('Edit'), { start: '2026-11-16' })).toBe(false)
    expect(confirm.mock.calls[0][0]).toContain('Push the publish date to Nov 16?')
    expect((await getProject(id))?.publishDate).toBe('2026-11-14')
  })

  it('pushes the publish date when accepted', async () => {
    const { id, named } = await sampleProject()
    confirm.mockReturnValue(true)
    expect(await moveTask(named('Edit'), { start: '2026-11-16' })).toBe(true)
    expect((await getProject(id))?.publishDate).toBe('2026-11-16')
  })
})

describe('addTask', () => {
  it('applies the same prompt to a new subtask', async () => {
    const { id } = await sampleProject()
    confirm.mockReturnValue(true)
    expect(await addTask(id, { title: 'Teaser', start: '2026-11-15' })).toBe(true)
    expect((await getProject(id))?.publishDate).toBe('2026-11-15')
  })
})

describe('movePublishDate', () => {
  it('names the tasks in the way', async () => {
    const { id } = await sampleProject()
    expect(await movePublishDate(id, '2026-11-11')).toBe(
      'Edit and Thumbnail end after Nov 11. Move them first, or shift the whole project.',
    )
    expect(await movePublishDate(id, '2026-11-20')).toBeNull()
  })
})

describe('setDone', () => {
  it('offers to archive only when Publish is ticked', async () => {
    const { id, named } = await sampleProject()
    const project = (await getProject(id))!
    confirm.mockReturnValue(true)

    expect(await setDone(named('Script'), project, true)).toEqual({ archived: false, notice: null })
    expect(confirm).not.toHaveBeenCalled()

    expect(await setDone(named('Publish'), project, true)).toEqual({
      archived: true,
      notice: 'Archived "Morning routine vlog".',
    })
    expect(confirm).toHaveBeenCalledOnce()
    expect((await getProject(id))?.archived).toBe(true)
  })

  it('waits for the clean-up: no offer while it’s open, then one for the last task', async () => {
    const { id, named } = await sampleProject(true)
    const project = (await getProject(id))!
    confirm.mockReturnValue(true)

    expect(await setDone(named('Publish'), project, true)).toEqual({
      archived: false,
      notice: 'Published · 2 clean-up tasks left',
    })
    expect(confirm).not.toHaveBeenCalled()
    const after = await getSubtasks(id)
    expect(after.filter((s) => s.kind === 'cleanup').every((s) => !s.done)).toBe(true)
    expect(getProgress(after).percent).toBe(100)

    expect(await setDone(named('Back up raw footage'), project, true)).toEqual({ archived: false, notice: null })
    expect(confirm).not.toHaveBeenCalled()
    expect((await setDone(named('Share on Instagram Stories'), project, true)).archived).toBe(true)
    expect(confirm.mock.calls[0][0]).toBe(
      '"Morning routine vlog" is published and its clean-up is done. Archive the project?',
    )
  })

  it('makes no offer for finishing clean-up before the video is out', async () => {
    const { id, named } = await sampleProject(true)
    const project = (await getProject(id))!
    await setDone(named('Back up raw footage'), project, true)
    await setDone(named('Share on Instagram Stories'), project, true)
    expect(confirm).not.toHaveBeenCalled()
  })

  it('reaches 100% when Publish is ticked, even if archiving is declined', async () => {
    const { id, named } = await sampleProject()
    const project = (await getProject(id))!
    confirm.mockReturnValue(false)

    await setDone(named('Publish'), project, true)
    expect(getProgress(await getSubtasks(id)).percent).toBe(100)
    expect((await getProject(id))?.archived).toBe(false)
  })
})

describe('setCleanupKind', () => {
  it('turns a task into clean-up, and back, with the guard rail on the way back', async () => {
    const { id, named } = await sampleProject()
    expect(await setCleanupKind(named('Edit'), true)).toBe(true)
    const edit = (await getSubtasks(id)).find((s) => s.title === 'Edit')!
    expect(edit.kind).toBe('cleanup')

    // As a clean-up task it can move past the publish date without asking.
    expect(await moveTask(edit, { start: '2026-11-16' })).toBe(true)
    expect(confirm).not.toHaveBeenCalled()

    const moved = (await getSubtasks(id)).find((s) => s.title === 'Edit')!
    confirm.mockReturnValue(false)
    expect(await setCleanupKind(moved, false)).toBe(false)
    expect(confirm.mock.calls[0][0]).toContain('Push the publish date to Nov 16?')
    expect((await getSubtasks(id)).find((s) => s.title === 'Edit')?.kind).toBe('cleanup')

    confirm.mockReturnValue(true)
    expect(await setCleanupKind(moved, false)).toBe(true)
    expect((await getProject(id))?.publishDate).toBe('2026-11-16')
    expect((await getSubtasks(id)).find((s) => s.title === 'Edit')?.kind).toBe('task')
  })
})
