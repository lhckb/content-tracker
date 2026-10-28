import Dexie from 'dexie'
import { pickColor } from '../lib/colors'
import type { ColorId, Idea, Project, Subtask } from '../types'
import { currentSpace, db, GUEST_DB_NAME, writing } from './db'

// The projects and ideas made on this device while signed out, which the
// app offers to copy into the account at sign-in.

export interface GuestCounts {
  projects: number
  ideas: number
}

const NONE: GuestCounts = { projects: 0, ideas: 0 }

async function readGuestSpace(): Promise<{ projects: Project[]; subtasks: Subtask[]; ideas: Idea[] }> {
  // A second handle on the guest database, readable while an account's is
  // the current one. Opened without a schema: it only reads. A table can be
  // missing if the guest space was last opened by an older version.
  const guest = new Dexie(GUEST_DB_NAME)
  try {
    await guest.open()
    const tables = guest.tables.map((t) => t.name)
    const read = async <T>(name: string): Promise<T[]> =>
      tables.includes(name) ? guest.table<T>(name).toArray() : []
    return {
      projects: await read<Project>('projects'),
      subtasks: await read<Subtask>('subtasks'),
      ideas: await read<Idea>('ideas'),
    }
  } finally {
    guest.close()
  }
}

export async function countGuestData(): Promise<GuestCounts> {
  const { projects, ideas } = await readGuestSpace()
  return { projects: projects.length, ideas: ideas.length }
}

// Copies every guest project, with its subtasks, and every guest idea into
// the signed-in account. They keep their ids; an active project whose color
// an account project already uses gets a free one. The guest space is left
// as it was. Returns how many were copied.
export async function copyGuestData(): Promise<GuestCounts> {
  if (currentSpace().kind !== 'account') throw new Error('Sign in before copying guest projects')
  const guest = await readGuestSpace()
  await writing(async () => {
    const taken: ColorId[] = (await db.projects.toArray())
      .filter((p) => !p.archived)
      .map((p) => p.color)
    const projects = guest.projects.map((project) => {
      if (project.archived) return project
      const color = taken.includes(project.color) ? pickColor(taken) : project.color
      taken.push(color)
      return { ...project, color }
    })
    await db.projects.bulkPut(projects)
    await db.subtasks.bulkPut(guest.subtasks)
    await db.ideas.bulkPut(guest.ideas)
  })
  return { projects: guest.projects.length, ideas: guest.ideas.length }
}

const OFFERED = 'guestCopyOffered'

// What to offer to copy into the account just signed in to: nothing if the
// guest space is empty, or this device already asked for this account.
export async function guestCopyOffer(): Promise<GuestCounts> {
  if (currentSpace().kind !== 'account' || (await db.meta.get(OFFERED))) return NONE
  return countGuestData()
}

// Records the answer so the device doesn't ask again, copying if it was
// yes. Returns how many were copied.
export async function answerGuestCopyOffer(copy: boolean): Promise<GuestCounts> {
  const copied = copy ? await copyGuestData() : NONE
  await writing(() => db.meta.put({ key: OFFERED, value: new Date().toISOString() }))
  return copied
}
