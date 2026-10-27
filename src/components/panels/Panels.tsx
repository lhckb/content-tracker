import type { TrackerData } from '../../data'
import type { ISODate } from '../../types'
import { Modal } from './Modal'
import { NewProjectDialog } from './NewProjectDialog'
import { ProjectDetail } from './ProjectDetail'
import { SubtaskCard } from './SubtaskCard'

// Which card is open over the calendar. Only one is open at a time; the
// subtask card's "Back to project" swaps it for the project detail.
export type Panel =
  | { kind: 'new-project' }
  | { kind: 'project'; id: string }
  | { kind: 'subtask'; id: string }

export function Panels({
  panel,
  data,
  today,
  onNavigate,
  onNotice,
}: {
  panel: Panel
  data: TrackerData
  today: ISODate
  onNavigate: (panel: Panel | null) => void
  onNotice: (message: string) => void
}) {
  const close = () => onNavigate(null)

  if (panel.kind === 'new-project') {
    return (
      <Modal key="new-project" label="New project" size="small" focusFirstField onClose={close}>
        <NewProjectDialog
          onCancel={close}
          onCreated={(id) => onNavigate({ kind: 'project', id })}
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
