import { sortSubtasks } from '../lib/subtasks'
import type { Idea, Project, Subtask } from '../types'
import { db } from './db'
import { subtasksOf } from './internal'

export interface TrackerData {
  projects: Project[]
  subtasks: Subtask[]
}

// Everything stored, read in one transaction so projects and subtasks agree.
export async function getTrackerData(): Promise<TrackerData> {
  return db.transaction('r', db.projects, db.subtasks, async () => ({
    projects: await db.projects.toArray(),
    subtasks: await db.subtasks.toArray(),
  }))
}

// Kept apart from getTrackerData, so editing an idea doesn't redraw the
// calendar.
export async function getIdeas(): Promise<Idea[]> {
  return db.ideas.toArray()
}

export async function getProject(id: string): Promise<Project | undefined> {
  return db.projects.get(id)
}

// A project's subtasks in list order: by date, Publish last.
export async function getSubtasks(projectId: string): Promise<Subtask[]> {
  return sortSubtasks(await subtasksOf(projectId).toArray())
}
