import type { ReactNode } from 'react'
import { cx } from './cx'

export type Tab = 'calendar' | 'projects' | 'ideas'

// Phone width only: switches between the calendar, the project list (which
// sit side by side on wider screens) and the ideas.
export function TabBar({ tab, onChange }: { tab: Tab; onChange: (tab: Tab) => void }) {
  return (
    <nav
      aria-label="Sections"
      // Padded up above the iPhone's home bar.
      className="flex shrink-0 border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <TabButton current={tab === 'calendar'} label="Calendar" onClick={() => onChange('calendar')}>
        <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
        <path d="M3.5 10h17M8 3v4M16 3v4" />
      </TabButton>
      <TabButton current={tab === 'projects'} label="Projects" onClick={() => onChange('projects')}>
        <path d="M8 6.5h12M8 12h12M8 17.5h12" />
        <circle cx="4.5" cy="6.5" r="0.75" />
        <circle cx="4.5" cy="12" r="0.75" />
        <circle cx="4.5" cy="17.5" r="0.75" />
      </TabButton>
      <TabButton current={tab === 'ideas'} label="Ideas" onClick={() => onChange('ideas')}>
        <path d="M12 3.5a6 6 0 0 0-3.5 10.9c.7.5 1 1.2 1 2.1h5c0-.9.3-1.6 1-2.1A6 6 0 0 0 12 3.5z" />
        <path d="M9.75 19.25h4.5M10.75 21.5h2.5" />
      </TabButton>
    </nav>
  )
}

function TabButton({
  current,
  label,
  onClick,
  children,
}: {
  current: boolean
  label: string
  onClick: () => void
  // The icon's shapes, drawn as 24×24 outlines.
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-current={current ? 'page' : undefined}
      onClick={onClick}
      className={cx(
        'flex min-h-14 flex-1 touch-manipulation flex-col items-center justify-center gap-0.5 text-xs',
        current ? 'font-semibold text-blue-700' : 'text-stone-500',
      )}
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="size-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      >
        {children}
      </svg>
      {label}
    </button>
  )
}
