// '1 project', '3 projects'
export function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

// '2 projects and 3 ideas', leaving out whichever is zero ('0 projects' if
// both are).
export function projectsAndIdeas({ projects, ideas }: { projects: number; ideas: number }): string {
  if (ideas === 0) return plural(projects, 'project')
  if (projects === 0) return plural(ideas, 'idea')
  return `${plural(projects, 'project')} and ${plural(ideas, 'idea')}`
}
