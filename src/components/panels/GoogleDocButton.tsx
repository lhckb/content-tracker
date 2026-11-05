import { useEffect, useState } from 'react'
import { googleDocs, GoogleDocsError, useAccount } from '../../data'
import { docUrl } from '../../lib/googleDocs'
import { ask } from '../ask'

const BUTTON =
  'inline-flex items-center gap-1.5 rounded-md border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-stone-50 disabled:cursor-wait disabled:opacity-60 max-md:py-1.5 max-md:text-sm'

// Create Google Doc → Creating… → Open Google Doc, beside a project's
// Notes or an idea's Description (docs/plans/google-docs.md). Hidden when
// signed out, or when the build has no Google client ID.
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
  const [busy, setBusy] = useState(false)
  const signedIn = account.state === 'signed-in'

  // Google's script loads with the card, not at startup, so it's ready by
  // the click: a window opened long after a click gets blocked.
  useEffect(() => {
    if (signedIn) googleDocs?.preload()
  }, [signedIn])

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
    // With a token in hand Google's window won't open, so the doc's tab
    // can open now, while the click still allows it. Otherwise Google's
    // window uses up the click, and the button's link opens the doc.
    const tab = docs.hasToken(email) ? openWaitingTab() : null
    setBusy(true)
    try {
      const made = kind === 'project' ? await docs.createProjectDoc(id, email) : await docs.createIdeaDoc(id, email)
      if (tab && !tab.closed) tab.location.replace(docUrl(made))
      else onNotice(`Made the Google Doc in the "Content Tracker" folder of your Drive.`)
    } catch (error) {
      tab?.close()
      onNotice(
        error instanceof GoogleDocsError
          ? error.message
          : `The Google Doc wasn't made: ${error instanceof Error ? error.message : String(error)}`,
      )
    } finally {
      setBusy(false)
    }
  }

  if (docId && !busy) {
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
    <button type="button" disabled={busy} onClick={() => void create(false)} className={BUTTON}>
      <DocIcon />
      {busy ? 'Creating…' : 'Create Google Doc'}
    </button>
  )
}

// A blank tab that the new doc then loads into. Not in the iPhone's Home
// Screen app, where a new tab leaves the app; there the link is the way in.
function openWaitingTab(): Window | null {
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  if (standalone) return null
  const tab = window.open('', '_blank')
  if (!tab) return null
  try {
    tab.document.title = 'Google Doc'
    tab.document.body.style.cssText = 'font: 15px system-ui, sans-serif; color: #57534e; padding: 2rem'
    tab.document.body.textContent = 'Making the Google Doc…'
  } catch {
    // Only a nicety; the doc still loads into it.
  }
  // The doc's page shouldn't be able to reach back into the app.
  tab.opener = null
  return tab
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
