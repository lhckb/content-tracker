import { useRef, useState } from 'react'
import { googleDocs, GoogleDocsError, GoogleDocsReplaced, useAccount, type DocPhase } from '../../data'
import { docUrl } from '../../lib/googleDocs'
import { ask } from '../ask'

const BUTTON =
  'inline-flex items-center gap-1.5 rounded-md border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-stone-50 disabled:cursor-wait disabled:opacity-60 max-md:py-1.5 max-md:text-sm'

// Create Google Doc → (Waiting for Google…) → Creating… → Open Google Doc,
// beside a project's Notes or an idea's Description
// (docs/plans/google-docs.md). The click opens a tab that goes to Google
// when needed and ends on the new doc. Hidden when signed out, or when the
// build has no Google client ID.
export function GoogleDocButton({
  kind,
  id,
  docId,
  onNotice,
}: {
  kind: 'project' | 'idea'
  id: string
  docId?: string
  onNotice: (message: string) => void
}) {
  const account = useAccount()
  const [phase, setPhase] = useState<DocPhase | null>(null)
  // Only the latest click updates the button; an earlier one it replaced
  // just stops.
  const click = useRef(0)

  if (!googleDocs || account.state !== 'signed-in') return null
  const docs = googleDocs
  const { email } = account

  async function create(newCopy: boolean) {
    if (newCopy) {
      const text = kind === 'project' ? 'notes' : 'description'
      const sure = await ask(
        `Make a new Google Doc from the ${text} as they are now? The button will open the new doc. The current one stays in your Drive.`,
        { confirmLabel: 'Make a new copy' },
      )
      if (!sure) return
    }
    const mine = ++click.current
    const update = (next: DocPhase | null) => {
      if (click.current === mine) setPhase(next)
    }
    try {
      // Nothing is awaited between the click and this call.
      const outcome = await docs.makeDoc({ kind, id }, email, update)
      if (outcome === 'made') onNotice('Made the Google Doc in the "Content Tracker" folder of your Drive.')
    } catch (error) {
      if (error instanceof GoogleDocsReplaced) return
      onNotice(
        error instanceof GoogleDocsError
          ? error.message
          : `The Google Doc wasn't made: ${error instanceof Error ? error.message : String(error)}`,
      )
    } finally {
      update(null)
    }
  }

  if (phase === 'google') {
    // Still clickable: if the Google tab was closed, this starts again.
    return (
      <button
        type="button"
        title="Finish in the Google tab, or click to start again"
        onClick={() => void create(false)}
        className={BUTTON}
      >
        <DocIcon />
        Waiting for Google…
      </button>
    )
  }
  if (docId && !phase) {
    return (
      <span className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void create(true)}
          className="text-xs text-stone-500 hover:text-stone-800 hover:underline max-md:py-1.5 max-md:text-sm"
        >
          Make a new copy
        </button>
        <a href={docUrl(docId)} target="_blank" rel="noopener noreferrer" className={BUTTON}>
          <DocIcon />
          Open Google Doc
        </a>
      </span>
    )
  }
  return (
    <button type="button" disabled={phase === 'creating'} onClick={() => void create(false)} className={BUTTON}>
      <DocIcon />
      {phase === 'creating' ? 'Creating…' : 'Create Google Doc'}
    </button>
  )
}

function DocIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-3.5 shrink-0 text-blue-600 max-md:size-4"
    >
      <path d="M9.5 1.5h-5A1.5 1.5 0 0 0 3 3v10a1.5 1.5 0 0 0 1.5 1.5h7A1.5 1.5 0 0 0 13 13V5Z" />
      <path d="M9.5 1.5V5H13M5.5 8.5h5M5.5 11h5" />
    </svg>
  )
}
