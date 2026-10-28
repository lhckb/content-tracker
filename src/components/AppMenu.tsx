import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import {
  backupFileName,
  clearAllData,
  exportBackupText,
  importBackupText,
  useAccount,
} from '../data'
import { loadSampleData } from '../dev/sampleData'
import { projectsAndIdeas } from '../lib/plural'
import { ask } from './ask'
import { cx } from './cx'

// The "⋯" menu in the top bar: backup export/import, plus sample data and
// a reset while running the dev server.
export function AppMenu({
  hasData,
  onNotice,
}: {
  hasData: boolean
  onNotice: (message: string) => void
}) {
  const account = useAccount()
  const [open, setOpen] = useState(false)
  // The backup, prepared as the menu opens: the iPhone share sheet only opens
  // straight from a tap, with no waiting on the database first.
  const [backup, setBackup] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    let current = true
    void exportBackupText().then((text) => {
      if (current) setBackup(text)
    })
    return () => {
      current = false
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  function run(action: () => Promise<string>) {
    setOpen(false)
    action().then(onNotice, (error: unknown) =>
      onNotice(error instanceof Error ? error.message : String(error)),
    )
  }

  async function confirmReplace(): Promise<boolean> {
    if (!hasData) return true
    const where = account.state === 'signed-in' ? 'in your account, on all your devices' : 'on this device'
    return ask(`This replaces your projects and ideas ${where}. Continue?`, {
      confirmLabel: 'Replace',
      danger: true,
    })
  }

  function onFileChosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    run(async () => {
      if (!(await confirmReplace())) return ''
      const counts = await importBackupText(await file.text())
      return `Imported ${projectsAndIdeas(counts)}.`
    })
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="rounded-md px-2.5 py-1 text-lg leading-none text-stone-600 hover:bg-stone-100 max-md:grid max-md:size-11 max-md:place-items-center max-md:p-0"
      >
        ⋯
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={onFileChosen}
      />
      {open && (
        <div
          role="menu"
          className="absolute top-full right-0 z-30 mt-1 w-60 rounded-md border border-stone-200 bg-white py-1 shadow-lg"
        >
          <p className="px-3 pt-1.5 pb-2 text-xs leading-snug text-stone-500">
            {account.state === 'signed-in'
              ? `Synced to your account, ${account.email}.`
              : account.state === 'signed-out'
                ? 'Saved on this device only. Sign in to keep your projects on all your devices.'
                : 'Projects are saved in this browser only. Export a backup now and then.'}
          </p>
          <MenuItem
            onClick={() => {
              const prepared = backup
              run(async () => {
                const saved = await saveBackup(prepared ?? (await exportBackupText()))
                return saved ? 'Backup exported.' : ''
              })
            }}
          >
            Export backup
          </MenuItem>
          <MenuItem
            onClick={() => {
              setOpen(false)
              fileRef.current?.click()
            }}
          >
            Import backup…
          </MenuItem>
          {import.meta.env.DEV && (
            <>
              <div className="my-1 border-t border-stone-100" />
              <p className="px-3 pt-1 text-xs text-stone-400">Development</p>
              <MenuItem
                onClick={() =>
                  run(async () => {
                    if (!(await confirmReplace())) return ''
                    await loadSampleData()
                    return 'Loaded sample data.'
                  })
                }
              >
                Load sample data
              </MenuItem>
              <MenuItem
                danger
                onClick={() =>
                  run(async () => {
                    const sure = await ask('Delete every project and idea? This can\'t be undone.', {
                      confirmLabel: 'Delete everything',
                      danger: true,
                    })
                    if (!sure) return ''
                    await clearAllData()
                    return 'Cleared all data.'
                  })
                }
              >
                Clear all data
              </MenuItem>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function MenuItem({
  children,
  onClick,
  danger = false,
}: {
  children: ReactNode
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cx(
        'block w-full px-3 py-1.5 text-left text-sm hover:bg-stone-100 max-md:py-3',
        danger && 'text-red-700',
      )}
    >
      {children}
    </button>
  )
}

// On a phone, hands the backup to the share sheet ("Save to Files"), the
// dependable way to save a file on an iPhone, especially from a Home Screen
// app. Elsewhere, or if sharing isn't possible, a normal download. Resolves
// false if the person closed the share sheet without saving.
async function saveBackup(text: string): Promise<boolean> {
  const fileName = backupFileName()
  const file = new File([text], fileName, { type: 'application/json' })
  if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return true
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return false
    }
  }
  downloadTextFile(fileName, text)
  return true
}

function downloadTextFile(fileName: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  setTimeout(() => URL.revokeObjectURL(url))
}
