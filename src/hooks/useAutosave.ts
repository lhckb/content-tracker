import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'

type TextInput = HTMLInputElement | HTMLTextAreaElement

// Props for a text input that saves as you type: after a short pause, and
// on blur. While it has focus the local text wins, so a save that lands
// mid-typing can't overwrite newer keystrokes. With `required`, blank text
// is never saved and reverts on blur.
export function useAutosave(
  value: string,
  save: (next: string) => void,
  { delay = 500, required = false } = {},
) {
  const [draft, setDraft] = useState(value)
  const [editing, setEditing] = useState(false)
  const [seen, setSeen] = useState(value)
  const pending = useRef<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const saveRef = useRef(save)
  useEffect(() => {
    saveRef.current = save
  })

  // Pick up changes made elsewhere, unless the person is typing.
  if (value !== seen) {
    setSeen(value)
    if (!editing) setDraft(value)
  }

  const flush = useCallback(() => {
    clearTimeout(timer.current)
    const next = pending.current
    pending.current = null
    if (next !== null) saveRef.current(next)
  }, [])

  // Save anything still waiting when the card closes.
  useEffect(() => flush, [flush])

  return {
    value: draft,
    onFocus: () => setEditing(true),
    onChange: (event: ChangeEvent<TextInput>) => {
      const next = event.target.value
      setDraft(next)
      clearTimeout(timer.current)
      pending.current = required && !next.trim() ? null : next
      if (pending.current !== null) timer.current = setTimeout(flush, delay)
    },
    onBlur: () => {
      flush()
      setEditing(false)
      if (required && !draft.trim()) setDraft(value)
    },
  }
}
