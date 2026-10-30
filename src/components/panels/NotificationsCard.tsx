import { useEffect, useId, useState } from 'react'
import {
  DEFAULT_REMINDER_TIME,
  notificationStatus,
  setReminderTime,
  turnOffNotifications,
  turnOnNotifications,
  useAccount,
  type NotificationStatus,
} from '../../data'
import { useAutosave } from '../../hooks/useAutosave'
import { formatClock } from '../../lib/dates'
import { cx } from '../cx'
import { WarningIcon } from '../WarningIcon'
import { CloseButton } from './Modal'

// Why the switch can't be used, for each state that disables it.
function reasonFor(state: NotificationStatus['state']): string | null {
  switch (state) {
    case 'unavailable':
      return "Notifications aren't set up in this version of the app."
    case 'signed-out':
      return 'Sign in to get notifications. They count the tasks in your account.'
    case 'insecure':
      return `Notifications only work when the app is opened from a secure (https) address. This copy is open at ${window.location.origin}, so the browser turns them off. Use the live site instead.`
    case 'needs-home-screen':
      return 'On iPhone, notifications work in the Home Screen app. In Safari, tap Share, then Add to Home Screen.'
    case 'update-ios':
      return 'Notifications in Home Screen apps need iOS 16.4 or later. Update in Settings, General, Software Update.'
    case 'blocked':
      return "Notifications are blocked for Content Tracker. Allow them in your device's settings, then come back here."
    case 'unsupported':
      return "This browser can't show notifications."
    default:
      return null
  }
}

// The ⋯ menu's Notifications card: the daily reminder on this device.
export function NotificationsCard({ onClose }: { onClose: () => void }) {
  const account = useAccount()
  const [status, setStatus] = useState<NotificationStatus | null>(null)
  const [time, setTime] = useState(DEFAULT_REMINDER_TIME)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const id = useId()
  const on = status?.state === 'on'
  const usable = status?.state === 'on' || status?.state === 'off'

  useEffect(() => {
    let current = true
    notificationStatus(account).then(
      (next) => {
        if (!current) return
        setStatus(next)
        if (next.state === 'on') setTime(next.time)
      },
      (failure: unknown) => current && setError(messageOf(failure)),
    )
    return () => {
      current = false
    }
  }, [account])

  // Saves after a pause, so the steps of typing a time aren't each sent.
  const timeInput = useAutosave(
    time,
    (next) => {
      setTime(next)
      if (on) setReminderTime(next).catch((failure: unknown) => setError(messageOf(failure)))
    },
    { delay: 800, required: true },
  )

  // Called straight from the tap, so turning on can show the permission
  // prompt before anything else happens.
  function toggle() {
    setBusy(true)
    setError('')
    const change = on
      ? turnOffNotifications().then((): NotificationStatus => ({ state: 'off' }))
      : turnOnNotifications(timeInput.value || time)
    change
      .then((next) => {
        setStatus(next)
        if (next.state === 'on') setTime(next.time)
      }, (failure: unknown) => setError(messageOf(failure)))
      .finally(() => setBusy(false))
  }

  const reason = status && reasonFor(status.state)
  return (
    <div className="flex flex-col gap-4 p-6">
      <header className="flex items-center">
        <h2 className="text-lg font-semibold">Notifications</h2>
        <CloseButton onClick={onClose} />
      </header>

      <div className="flex items-center justify-between gap-4 rounded-md border border-stone-300 px-3 py-2.5">
        <span id={`${id}-switch`} className="text-sm font-medium">
          Daily reminder on this device
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby={`${id}-switch`}
          disabled={!usable || busy}
          onClick={toggle}
          className={cx(
            'relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50',
            on ? 'bg-blue-600' : 'bg-stone-300',
          )}
        >
          <span
            className={cx(
              'absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform',
              on && 'translate-x-5',
            )}
          />
        </button>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-time`} className="text-sm text-stone-600">
          Time
        </label>
        <input
          id={`${id}-time`}
          type="time"
          {...timeInput}
          disabled={!usable}
          className="w-36 rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm tabular-nums focus:border-blue-500 focus:outline-none disabled:text-stone-400 max-md:py-2 max-md:text-base"
        />
      </div>

      <p className="text-sm leading-relaxed text-stone-600">
        Every day at {formatClock(time)}: "You have 3 tasks for 2 projects today, plus 1 overdue."
        Nothing on days with nothing to do.
      </p>

      {status === null && !error && <p className="text-sm text-stone-500">Checking this device…</p>}
      {reason && <Warning>{reason}</Warning>}
      {error && <Warning alert>{error}</Warning>}
    </div>
  )
}

// Why reminders can't be turned on, or what went wrong, outlined in red.
function Warning({ alert = false, children }: { alert?: boolean; children: string }) {
  return (
    <p
      role={alert ? 'alert' : undefined}
      className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2.5 text-sm leading-relaxed text-red-800"
    >
      <WarningIcon className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  )
}

function messageOf(failure: unknown): string {
  return failure instanceof Error ? failure.message : String(failure)
}
