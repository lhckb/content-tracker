import { AppMenu } from './AppMenu'

export function TopBar({
  hasData,
  onNewProject,
  onNotice,
}: {
  hasData: boolean
  onNewProject: () => void
  onNotice: (message: string) => void
}) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-stone-200 bg-white px-4">
      <h1 className="font-semibold">Content Tracker</h1>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onNewProject}
          className="rounded-md border border-blue-500 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-900 hover:bg-blue-100"
        >
          + New project
        </button>
        <AppMenu hasData={hasData} onNotice={onNotice} />
      </div>
    </header>
  )
}
