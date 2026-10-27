import { useCallback, useState } from 'react'
import { CalendarView } from './components/calendar/CalendarView'
import { ConfirmHost } from './components/ConfirmHost'
import { Panels, type Panel } from './components/panels/Panels'
import { Sidebar } from './components/Sidebar'
import { Toast } from './components/Toast'
import { TopBar } from './components/TopBar'
import { useTrackerData } from './data'
import { useToday } from './hooks/useToday'

function App() {
  const data = useTrackerData()
  const today = useToday()
  const [panel, setPanel] = useState<Panel | null>(null)
  const [notice, setNotice] = useState('')
  const dismissNotice = useCallback(() => setNotice(''), [])
  const openProject = useCallback((id: string) => setPanel({ kind: 'project', id }), [])
  const openSubtask = useCallback((id: string) => setPanel({ kind: 'subtask', id }), [])

  return (
    <div className="flex h-screen flex-col">
      <TopBar
        hasData={Boolean(data?.projects.length)}
        onNewProject={() => setPanel({ kind: 'new-project' })}
        onNotice={setNotice}
      />
      <div className="flex min-h-0 flex-1">
        <Sidebar data={data} today={today} onOpenProject={openProject} />
        <main className="min-w-0 flex-1 overflow-auto p-4">
          <CalendarView
            data={data}
            today={today}
            onOpenProject={openProject}
            onOpenSubtask={openSubtask}
            onNotice={setNotice}
          />
        </main>
      </div>
      {panel && data && (
        <Panels
          panel={panel}
          data={data}
          today={today}
          onNavigate={setPanel}
          onNotice={setNotice}
        />
      )}
      <ConfirmHost />
      <Toast message={notice} onDismiss={dismissNotice} />
    </div>
  )
}

export default App
