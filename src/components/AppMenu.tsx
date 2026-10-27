import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { backupFileName, clearAllData, exportBackupText, importBackupText } from '../data'
import { loadSampleData } from '../dev/sampleData'
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
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

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

  function confirmReplace(): boolean {
    return !hasData || confirm('This replaces every project currently stored. Continue?')
  }

  function onFileChosen(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !confirmReplace()) return
    run(async () => {
      const counts = await importBackupText(await file.text())
      return `Imported ${plural(counts.projects, 'project')}.`
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
        className="rounded-md px-2.5 py-1 text-lg leading-none text-stone-600 hover:bg-stone-100"
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
          className="absolute top-full right-0 z-30 mt-1 w-52 rounded-md border border-stone-200 bg-white py-1 shadow-lg"
        >
          <MenuItem
            onClick={() =>
              run(async () => {
                downloadTextFile(backupFileName(), await exportBackupText())
                return 'Backup exported.'
              })
            }
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
                onClick={() => {
                  if (!confirmReplace()) return
                  run(async () => {
                    await loadSampleData()
                    return 'Loaded sample data.'
                  })
                }}
              >
                Load sample data
              </MenuItem>
              <MenuItem
                danger
                onClick={() => {
                  if (!confirm('Delete every project?')) return
                  run(async () => {
                    await clearAllData()
                    return 'Cleared all data.'
                  })
                }}
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
        'block w-full px-3 py-1.5 text-left text-sm hover:bg-stone-100',
        danger && 'text-red-700',
      )}
    >
      {children}
    </button>
  )
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

function downloadTextFile(fileName: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  setTimeout(() => URL.revokeObjectURL(url))
}
