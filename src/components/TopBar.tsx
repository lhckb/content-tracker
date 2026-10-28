import { AccountButton } from './AccountButton'
import { AppMenu } from './AppMenu'
import { cx } from './cx'

export type Area = 'calendar' | 'ideas'

export function TopBar({
  area,
  onArea,
  hasData,
  onNewProject,
  onNotice,
}: {
  area: Area
  onArea: (area: Area) => void
  hasData: boolean
  onNewProject: () => void
  onNotice: (message: string) => void
}) {
  return (
    // Padded down past the iPhone's status bar and notch.
    <header className="flex h-[calc(3.5rem+env(safe-area-inset-top))] shrink-0 items-center justify-between border-b border-stone-200 bg-white px-4 pt-[env(safe-area-inset-top)]">
      <div className="flex min-w-0 items-center gap-4">
        <h1 className="truncate font-semibold">Content Tracker</h1>
        {/* At phone width the tab bar does this. */}
        <div role="group" aria-label="Area" className="flex rounded-md border border-stone-300 p-0.5 max-md:hidden">
          {(['calendar', 'ideas'] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={area === option}
              onClick={() => onArea(option)}
              className={cx(
                'rounded px-3 py-1 text-sm',
                area === option ? 'bg-stone-200 font-medium' : 'text-stone-600 hover:bg-stone-100',
              )}
            >
              {option === 'calendar' ? 'Calendar' : 'Ideas'}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onNewProject}
          className="rounded-md border border-blue-500 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-900 hover:bg-blue-100 max-md:grid max-md:size-10 max-md:place-items-center max-md:p-0 max-md:text-xl"
        >
          + <span className="max-md:sr-only">New project</span>
        </button>
        <AccountButton onNotice={onNotice} />
        <AppMenu hasData={hasData} onNotice={onNotice} />
      </div>
    </header>
  )
}
