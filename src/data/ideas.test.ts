import { beforeEach, describe, expect, it } from 'vitest'
import {
  addIdea,
  clearAllData,
  createProject,
  deleteIdea,
  getIdeas,
  getProject,
  getSubtasks,
  getTrackerData,
  makeProjectFromIdea,
  updateIdea,
} from '.'

beforeEach(async () => {
  await clearAllData()
})

describe('ideas', () => {
  it('adds an idea with a trimmed title and no month by default', async () => {
    const id = await addIdea({ title: '  Studio tour ', platform: 'youtube' })
    const [idea] = await getIdeas()
    expect(idea).toMatchObject({ id, title: 'Studio tour', platform: 'youtube', description: '' })
    expect(idea).not.toHaveProperty('month')
    expect(Date.parse(idea.createdAt)).not.toBeNaN()
  })

  it('edits, sets and clears the month', async () => {
    const id = await addIdea({ title: 'Studio tour', platform: 'youtube' })
    await updateIdea(id, { description: 'New shelves', platform: 'instagram', month: '2027-03' })
    expect((await getIdeas())[0]).toMatchObject({ description: 'New shelves', platform: 'instagram', month: '2027-03' })
    await updateIdea(id, { month: undefined })
    expect((await getIdeas())[0]).not.toHaveProperty('month')
  })

  it('refuses a malformed month', async () => {
    await expect(addIdea({ title: 'Studio tour', platform: 'youtube', month: '2027-3' })).rejects.toThrow()
    const id = await addIdea({ title: 'Studio tour', platform: 'youtube' })
    await expect(updateIdea(id, { month: '2027-13' })).rejects.toThrow()
  })

  it('deletes an idea', async () => {
    const id = await addIdea({ title: 'Studio tour', platform: 'youtube' })
    await deleteIdea(id)
    expect(await getIdeas()).toEqual([])
  })

  it('stays off the calendar', async () => {
    await addIdea({ title: 'Studio tour', platform: 'youtube', month: '2027-03' })
    expect(await getTrackerData()).toEqual({ projects: [], subtasks: [] })
  })
})

describe('making a project from an idea', () => {
  it('creates the project with its subtasks and the idea’s description as notes, and removes the idea', async () => {
    const ideaId = await addIdea({
      title: 'Studio tour',
      platform: 'instagram',
      description: 'Show the new shelves',
      month: '2027-03',
    })
    const projectId = await makeProjectFromIdea(ideaId, {
      title: 'Studio tour, edited',
      platform: 'instagram',
      publishDate: '2027-03-20',
      withDefaultSubtasks: true,
    })

    expect(await getProject(projectId)).toMatchObject({
      title: 'Studio tour, edited',
      platform: 'instagram',
      publishDate: '2027-03-20',
      notes: 'Show the new shelves',
      archived: false,
    })
    expect((await getSubtasks(projectId)).map((s) => s.title)).toEqual([
      'Script',
      'A-roll',
      'B-roll',
      'Edit',
      'Thumbnail',
      'Publish',
    ])
    expect(await getIdeas()).toEqual([])
  })

  it('takes a free color, not one an active project uses', async () => {
    await createProject({ title: 'Existing', platform: 'youtube', publishDate: '2027-01-10', withDefaultSubtasks: false })
    const ideaId = await addIdea({ title: 'Studio tour', platform: 'youtube' })
    const projectId = await makeProjectFromIdea(ideaId, {
      title: 'Studio tour',
      platform: 'youtube',
      publishDate: '2027-03-20',
      withDefaultSubtasks: false,
    })
    expect((await getProject(projectId))?.color).toBe('green')
  })

  it('changes nothing if the idea is gone', async () => {
    const ideaId = await addIdea({ title: 'Studio tour', platform: 'youtube' })
    await deleteIdea(ideaId)
    await expect(
      makeProjectFromIdea(ideaId, {
        title: 'Studio tour',
        platform: 'youtube',
        publishDate: '2027-03-20',
        withDefaultSubtasks: true,
      }),
    ).rejects.toThrow()
    expect((await getTrackerData()).projects).toEqual([])
  })
})
