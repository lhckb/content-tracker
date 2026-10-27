import { useCallback, useState } from 'react'
import { MonthView } from './components/calendar/MonthView'
import { Sidebar } from './components/Sidebar'
import { Toast } from './components/Toast'
import { TopBar } from './components/TopBar'
import { useTrackerData } from './data'
import { useToday } from './hooks/useToday'

function App() {
  const data = useTrackerData()
  const today = useToday()
  const [notice, setNotice] = useState('')
  const dismissNotice = useCallback(() => setNotice(''), [])

  return (
    <div className="flex h-screen flex-col">
      <TopBar hasData={Boolean(data?.projects.length)} onNotice={setNotice} />
      <div className="flex min-h-0 flex-1">
        <Sidebar data={data} today={today} />
        <main className="min-w-0 flex-1 overflow-auto p-4">
          <MonthView data={data} today={today} />
        </main>
      </div>
      <Toast message={notice} onDismiss={dismissNotice} />
    </div>
  )
}

export default App
