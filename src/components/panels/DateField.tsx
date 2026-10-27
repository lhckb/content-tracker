import { useEffect, useRef, useState } from 'react'
import { isPlausibleDate } from '../../lib/dates'
import type { ISODate } from '../../types'
import { cx } from '../cx'

// Typing a date changes it one part at a time (month, then day, then year),
// and each part alone already makes a complete date. Waiting this long
// after the last change keeps those in-between dates from being saved.
const SETTLE_MS = 700

// A date input that saves once it holds a complete, plausible date (or is
// emptied, when `optional`): after a short pause, on Enter, or on leaving
// the field. `onCommit` resolves false when the change was refused, and the
// field goes back to the stored date.
export function DateField({
  value,
  onCommit,
  optional = false,
  min,
  label,
  className,
}: {
  value: ISODate | undefined
  onCommit: (next: ISODate | undefined) => Promise<boolean>
  optional?: boolean
  min?: ISODate
  label: string
  className?: string
}) {
  const stored = value ?? ''
  const [draft, setDraft] = useState(stored)
  const [seen, setSeen] = useState(stored)
  if (stored !== seen) {
    setSeen(stored)
    setDraft(stored)
  }

  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  // The value being saved right now, so a blur caused by the confirm prompt
  // doesn't submit it a second time.
  const committing = useRef<string | null>(null)
  const pending = useRef<string | null>(null)

  // A half-typed date reads as '' too; `badInput` tells it apart from a
  // field that was really emptied.
  const isComplete = (next: string, badInput: boolean) =>
    !badInput && (next === '' ? optional : isPlausibleDate(next))

  function commit(next: string, badInput = false) {
    clearTimeout(timer.current)
    pending.current = null
    if (next === stored || next === committing.current) return
    if (!isComplete(next, badInput)) {
      setDraft(stored)
      return
    }
    committing.current = next
    void onCommit(next || undefined).then((accepted) => {
      committing.current = null
      if (!accepted) setDraft(stored)
    })
  }

  // Save a date still settling when the card closes.
  const commitRef = useRef(commit)
  useEffect(() => {
    commitRef.current = commit
  })
  useEffect(
    () => () => {
      if (pending.current !== null) commitRef.current(pending.current)
    },
    [],
  )

  return (
    <input
      type="date"
      aria-label={label}
      value={draft}
      min={min}
      onChange={(event) => {
        const next = event.target.value
        setDraft(next)
        clearTimeout(timer.current)
        pending.current = isComplete(next, event.target.validity.badInput) ? next : null
        if (pending.current !== null) timer.current = setTimeout(() => commit(next), SETTLE_MS)
      }}
      onBlur={(event) => commit(draft, event.currentTarget.validity.badInput)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit(draft, event.currentTarget.validity.badInput)
      }}
      className={cx(
        'rounded-md border border-stone-300 bg-white px-2 py-1 text-sm tabular-nums focus:border-blue-500 focus:outline-none',
        className,
      )}
    />
  )
}
