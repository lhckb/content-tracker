import type { TrackerData } from '../../data'
import type { ISODate, Idea } from '../../types'
import { IdeaCard } from './IdeaCard'
import { Modal } from './Modal'
import { NewProjectDialog } from './NewProjectDialog'
import { NotificationsCard } from './NotificationsCard'
import { ProjectDetail } from './ProjectDetail'
import { SubtaskCard } from './SubtaskCard'

// Which card is open over the calendar or the ideas. Only one is open at a
// time; the subtask card's "Back to project" swaps it for the project
// detail. A new project made from an idea names it.
export type Panel =
  | { kind: 'new-project'; ideaId?: string }
  | { kind: 'project'; id: string }
  | { kind: 'subtask'; id: string }
  | { kind: 'idea'; id: string }
  | { kind: 'notifications' }

export function Panels({
  panel,
  data,
  ideas,
  today,
  onNavigate,
  onProjectFromIdea,
  onNotice,
}: {
  panel: Panel
  data: TrackerData
  ideas: Idea[]
  today: ISODate
  onNavigate: (panel: Panel | null) => void
  // A project was just made from an idea.
  onProjectFromIdea: (projectId: string) => void
  onNotice: (message: string) => void
}) {
  const close = () => onNavigate(null)

  if (panel.kind === 'new-project') {
    const idea = panel.ideaId === undefined ? undefined : ideas.find((i) => i.id === panel.ideaId)
    // The idea is gone, e.g. deleted on another device.
    if (panel.ideaId !== undefined && !idea) return null
    return (
      <Modal
        key="new-project"
        label="New project"
        size="small"
        focus={idea ? 'input[type="date"]' : 'input'}
        onClose={close}
      >
        <NewProjectDialog
          idea={idea}
          onCancel={close}
          onCreated={(id) => (idea ? onProjectFromIdea(id) : onNavigate({ kind: 'project', id }))}
        />
      </Modal>
    )
  }

  if (panel.kind === 'notifications') {
    return (
      <Modal key="notifications" label="Notifications" size="small" onClose={close}>
        <NotificationsCard onClose={close} />
      </Modal>
    )
  }

  if (panel.kind === 'idea') {
    const idea = ideas.find((i) => i.id === panel.id)
    if (!idea) return null
    return (
      <Modal key="idea" label={idea.title} size="small" onClose={close}>
        <IdeaCard
          idea={idea}
          today={today}
          onMakeProject={() => onNavigate({ kind: 'new-project', ideaId: idea.id })}
          onClose={close}
        />
      </Modal>
    )
  }

  if (panel.kind === 'project') {
    const project = data.projects.find((p) => p.id === panel.id)
    // Gone, e.g. deleted from another tab.
    if (!project) return null
    return (
      <Modal key="project" label={project.title} size="large" onClose={close}>
        <ProjectDetail
          project={project}
          subtasks={data.subtasks.filter((s) => s.projectId === project.id)}
          otherActive={data.projects.filter((p) => !p.archived && p.id !== project.id)}
          today={today}
          onOpenSubtask={(id) => onNavigate({ kind: 'subtask', id })}
          onClose={close}
          onNotice={onNotice}
        />
      </Modal>
    )
  }

  const subtask = data.subtasks.find((s) => s.id === panel.id)
  const project = subtask && data.projects.find((p) => p.id === subtask.projectId)
  if (!subtask || !project) return null
  return (
    <Modal key="subtask" label={subtask.title} size="small" onClose={close}>
      <SubtaskCard
        subtask={subtask}
        project={project}
        onBack={() => onNavigate({ kind: 'project', id: project.id })}
        onClose={close}
        onNotice={onNotice}
      />
    </Modal>
  )
}
