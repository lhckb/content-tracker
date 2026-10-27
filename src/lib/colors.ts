import type { ColorId, Project } from '../types'

// In auto-assignment order. Red is left out so it only ever means overdue.
export const COLOR_IDS: readonly ColorId[] = [
  'blue',
  'green',
  'orange',
  'pink',
  'violet',
  'teal',
  'amber',
  'brown',
]

export const COLOR_HEX: Record<ColorId, string> = {
  blue: '#2f7ae5',
  green: '#1f9d55',
  orange: '#f0703a',
  pink: '#d9467e',
  violet: '#8b5cf6',
  teal: '#0f9b9b',
  amber: '#d99a06',
  brown: '#9a6b47',
}

export const ARCHIVED_HEX = '#a8a29e'

// Overdue tasks are marked in red, which no project color uses.
export const OVERDUE_HEX = '#dc2626'

// Archived projects are drawn in gray whatever their color.
export function projectHex(project: Pick<Project, 'color' | 'archived'>): string {
  return project.archived ? ARCHIVED_HEX : COLOR_HEX[project.color]
}

// A CSS color: `hex` mixed into white, e.g. 15 for a light tint. Mixing into
// 'transparent' instead lets what's underneath (today's shading) show through.
export function tint(hex: string, percent: number, base = 'white'): string {
  return `color-mix(in srgb, ${hex} ${percent}%, ${base})`
}

export function isColorId(value: unknown): value is ColorId {
  return COLOR_IDS.includes(value as ColorId)
}

// The first color no active project uses. Once all are taken, the least-used
// one repeats, so a ninth active project still gets a color.
export function pickColor(taken: readonly ColorId[]): ColorId {
  const uses = (id: ColorId) => taken.filter((t) => t === id).length
  return COLOR_IDS.reduce((best, id) => (uses(id) < uses(best) ? id : best))
}

// A color can be chosen if no other active project uses it, or if every
// color is already in use and a repeat can't be avoided.
export function isColorAvailable(
  color: ColorId,
  takenByOthers: readonly ColorId[],
): boolean {
  return (
    !takenByOthers.includes(color) ||
    COLOR_IDS.every((id) => takenByOthers.includes(id))
  )
}
