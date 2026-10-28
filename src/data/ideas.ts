import { assertISOMonth } from '../lib/ideas'
import type { ISOMonth, Idea, Platform } from '../types'
import { db, requestPersistentStorage, writing } from './db'
import { newId } from './ids'
import { createProject, type NewProject } from './projects'

export interface NewIdea {
  title: string
  platform: Platform
  description?: string
  month?: ISOMonth
}

// Returns the new idea's id.
export async function addIdea(input: NewIdea): Promise<string> {
  if (input.month !== undefined) assertISOMonth(input.month)
  void requestPersistentStorage()
  const idea: Idea = {
    id: newId(),
    title: input.title.trim(),
    platform: input.platform,
    description: input.description ?? '',
    ...(input.month ? { month: input.month } : {}),
    createdAt: new Date().toISOString(),
  }
  await writing(() => db.ideas.add(idea))
  return idea.id
}

// `month: undefined` clears the month.
export type IdeaPatch = Partial<Pick<Idea, 'title' | 'platform' | 'description' | 'month'>>

export async function updateIdea(id: string, patch: IdeaPatch): Promise<void> {
  if (patch.month !== undefined) assertISOMonth(patch.month)
  await writing(() => db.ideas.update(id, patch))
}

export async function deleteIdea(id: string): Promise<void> {
  await writing(() => db.ideas.delete(id))
}

// Creates the project and removes the idea in one change, so sync can never
// end up with both or neither. The idea's description becomes the project's
// notes. Returns the new project's id.
export async function makeProjectFromIdea(
  ideaId: string,
  input: Omit<NewProject, 'notes'>,
): Promise<string> {
  return writing(async () => {
    const idea = await db.ideas.get(ideaId)
    if (!idea) throw new Error(`No idea with id ${ideaId}`)
    const projectId = await createProject({ ...input, notes: idea.description })
    await db.ideas.delete(ideaId)
    return projectId
  })
}
