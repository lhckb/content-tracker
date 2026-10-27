import { useEffect, useRef, useState } from 'react'
import {
  signInWithGoogle,
  signOut,
  syncNow,
  useAccount,
  useSyncStatus,
  type Account,
  type SyncStatus,
} from '../data'
import { ask } from './ask'
import { cx } from './cx'
import { CloseButton, Modal } from './panels/Modal'
import { describeSync } from './syncText'

// The top bar's sign-in button, or once signed in, the account menu with
// the sync status. Hidden in builds without a Supabase project.
export function AccountButton({ onNotice }: { onNotice: (message: string) => void }) {
  const account = useAccount()
  const [signingIn, setSigningIn] = useState(false)

  if (account.state === 'unavailable' || account.state === 'loading') return null
  if (account.state === 'signed-in') return <AccountMenu account={account} onNotice={onNotice} />
  return (
    <>
      <button
        type="button"
        onClick={() => setSigningIn(true)}
        className="rounded-md px-2.5 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-100 max-md:min-h-11"
      >
        Sign in
      </button>
      {signingIn && (
        <Modal label="Sign in" size="alert" focus="[data-continue]" onClose={() => setSigningIn(false)}>
          <div className="flex flex-col gap-4 p-6">
            <header className="flex items-center">
              <h2 className="text-lg font-semibold">Sync your projects</h2>
              <CloseButton onClick={() => setSigningIn(false)} />
            </header>
            <p className="text-sm leading-relaxed text-stone-600">
              Sign in with Google to keep your projects safe and on all your devices. Projects made on
              this device while signed out stay here, and you can add them to your account.
            </p>
            <footer className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSigningIn(false)}
                className="rounded-md border border-stone-300 px-4 py-2 text-sm hover:bg-stone-50"
              >
                Not now
              </button>
              <button
                type="button"
                data-continue
                onClick={() =>
                  signInWithGoogle().catch((error: unknown) =>
                    onNotice(error instanceof Error ? error.message : String(error)),
                  )
                }
                className="rounded-md border border-blue-500 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-900 hover:bg-blue-100"
              >
                Continue with Google
              </button>
            </footer>
          </div>
        </Modal>
      )}
    </>
  )
}

const DOT: Record<SyncStatus['state'], string> = {
  off: 'bg-stone-300',
  syncing: 'bg-stone-400 animate-pulse',
  synced: 'bg-green-500',
  offline: 'bg-amber-500',
  error: 'bg-red-600',
}

function AccountMenu({
  account,
  onNotice,
}: {
  account: Extract<Account, { state: 'signed-in' }>
  onNotice: (message: string) => void
}) {
  const status = useSyncStatus()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

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

  async function leave() {
    setOpen(false)
    const sure = await ask(
      "Sign out? This device's copy of your projects will be removed. They stay in your account.",
      { confirmLabel: 'Sign out' },
    )
    if (!sure) return
    const result = await signOut()
    if (!result.ok) {
      const count = `${result.unsynced} ${result.unsynced === 1 ? 'change' : 'changes'}`
      const anyway = await ask(
        `${count} haven't reached your account yet, and this device can't reach the server right now. Sign out anyway and lose ${result.unsynced === 1 ? 'it' : 'them'}?`,
        { confirmLabel: 'Sign out anyway', danger: true },
      )
      if (!anyway) return
      await signOut({ discardUnsynced: true })
    }
    onNotice('Signed out.')
  }

  const initial = (account.name || account.email || '?').trim()[0]?.toUpperCase() ?? '?'

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={`Account: ${account.email}. ${describeSync(status)}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="relative grid size-9 place-items-center rounded-full bg-stone-800 text-sm font-semibold text-white max-md:size-10"
      >
        {initial}
        <span
          aria-hidden="true"
          className={cx('absolute -right-0.5 -bottom-0.5 size-3 rounded-full ring-2 ring-white', DOT[status.state])}
        />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute top-full right-0 z-30 mt-1 w-64 rounded-md border border-stone-200 bg-white py-1 shadow-lg"
        >
          <div className="px-3 pt-1.5 pb-2">
            <p className="truncate text-sm font-medium">{account.email}</p>
            <p className="mt-0.5 text-xs leading-snug text-stone-500">{describeSync(status)}</p>
          </div>
          <div className="my-1 border-t border-stone-100" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              void syncNow()
            }}
            className="block w-full px-3 py-1.5 text-left text-sm hover:bg-stone-100 max-md:py-3"
          >
            Sync now
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => void leave()}
            className="block w-full px-3 py-1.5 text-left text-sm hover:bg-stone-100 max-md:py-3"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
