import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAllData, createProject, getProject, getSubtasks } from '../data'
import { addTask, movePublishDate, moveTask, setDone } from './actions'

const confirm = vi.fn<(message: string) => boolean>()

beforeEach(async () => {
  await clearAllData()
  vi.stubGlobal('confirm', confirm)
})

afterEach(() => {
  vi.unstubAllGlobals()
  confirm.mockReset()
})

async function sampleProject() {
  const id = await createProject({
    title: 'Morning routine vlog',
    platform: 'youtube',
    publishDate: '2026-11-14',
    withDefaultSubtasks: true,
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

    expect(await setDone(named('Script'), project, true)).toBe(false)
    expect(confirm).not.toHaveBeenCalled()

    expect(await setDone(named('Publish'), project, true)).toBe(true)
    expect(confirm).toHaveBeenCalledOnce()
    expect((await getProject(id))?.archived).toBe(true)
  })
})
