import Dexie from 'dexie'
import { pickColor } from '../lib/colors'
import type { ColorId, Project, Subtask } from '../types'
import { currentSpace, db, GUEST_DB_NAME, writing } from './db'

// The projects made on this device while signed out, which the app offers
// to copy into the account at sign-in.

async function readGuestSpace(): Promise<{ projects: Project[]; subtasks: Subtask[] }> {
  // A second handle on the guest database, readable while an account's is
  // the current one. Opened without a schema: it only reads.
  const guest = new Dexie(GUEST_DB_NAME)
  try {
    await guest.open()
    const tables = guest.tables.map((t) => t.name)
    if (!tables.includes('projects') || !tables.includes('subtasks')) {
      return { projects: [], subtasks: [] }
    }
    return {
      projects: await guest.table<Project>('projects').toArray(),
      subtasks: await guest.table<Subtask>('subtasks').toArray(),
    }
  } finally {
    guest.close()
  }
}

export async function countGuestProjects(): Promise<number> {
  return (await readGuestSpace()).projects.length
}

// Copies every guest project, with its subtasks, into the signed-in
// account. They keep their ids; an active project whose color an account
// project already uses gets a free one. The guest space is left as it was.
// Returns how many projects were copied.
export async function copyGuestProjects(): Promise<number> {
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
  })
  return guest.projects.length
}
