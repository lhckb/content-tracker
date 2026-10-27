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
    // Padded down past the iPhone's status bar and notch.
    <header className="flex h-[calc(3.5rem+env(safe-area-inset-top))] shrink-0 items-center justify-between border-b border-stone-200 bg-white px-4 pt-[env(safe-area-inset-top)]">
      <h1 className="truncate font-semibold">Content Tracker</h1>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onNewProject}
          className="rounded-md border border-blue-500 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-900 hover:bg-blue-100 max-md:grid max-md:size-10 max-md:place-items-center max-md:p-0 max-md:text-xl"
        >
          + <span className="max-md:sr-only">New project</span>
        </button>
        <AppMenu hasData={hasData} onNotice={onNotice} />
      </div>
    </header>
  )
}
