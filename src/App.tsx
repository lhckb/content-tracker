import { useCallback, useState } from 'react'
import { CalendarView } from './components/calendar/CalendarView'
import { ConfirmHost } from './components/ConfirmHost'
import { Panels, type Panel } from './components/panels/Panels'
import { Sidebar } from './components/Sidebar'
import { TabBar, type Tab } from './components/TabBar'
import { Toast } from './components/Toast'
import { cx } from './components/cx'
import { TopBar } from './components/TopBar'
import { useTrackerData } from './data'
import { useToday } from './hooks/useToday'

function App() {
  const data = useTrackerData()
  const today = useToday()
  const [panel, setPanel] = useState<Panel | null>(null)
  // Which half shows at phone width; wider screens show both side by side.
  const [tab, setTab] = useState<Tab>('calendar')
  const [notice, setNotice] = useState('')
  const dismissNotice = useCallback(() => setNotice(''), [])
  const openProject = useCallback((id: string) => setPanel({ kind: 'project', id }), [])
  const openSubtask = useCallback((id: string) => setPanel({ kind: 'subtask', id }), [])

  return (
    // dvh follows Safari's toolbars as they show and hide; the side insets
    // keep clear of the notch in landscape.
    <div className="flex h-dvh flex-col pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]">
      <TopBar
        hasData={Boolean(data?.projects.length)}
        onNewProject={() => setPanel({ kind: 'new-project' })}
        onNotice={setNotice}
      />
      <div className="flex min-h-0 flex-1">
        <Sidebar
          data={data}
          today={today}
          onOpenProject={openProject}
          className={tab === 'projects' ? undefined : 'max-md:hidden'}
        />
        <main className={cx('min-w-0 flex-1 overflow-auto p-4 max-md:p-3', tab !== 'calendar' && 'max-md:hidden')}>
          <CalendarView
            data={data}
            today={today}
            onOpenProject={openProject}
            onOpenSubtask={openSubtask}
            onNotice={setNotice}
          />
        </main>
      </div>
      <TabBar tab={tab} onChange={setTab} />
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
