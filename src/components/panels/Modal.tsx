import { useEffect, useRef, type ReactNode } from 'react'
import { cx } from '../cx'

// A card over the calendar, built on <dialog> for focus handling and Escape.
// Clicking the dimmed backdrop closes it. Focus starts on the card itself,
// so a stray keypress can't edit the first field, unless `focusFirstField`.
export function Modal({
  label,
  size,
  focusFirstField = false,
  onClose,
  children,
}: {
  label: string
  size: 'small' | 'large'
  focusFirstField?: boolean
  onClose: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  // Only a click that starts and ends on the backdrop closes the card, not
  // a text selection dragged out of an input.
  const pressedBackdrop = useRef(false)

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
    // showModal() focuses the first focusable element, which is often ✕.
    if (focusFirstField) dialog?.querySelector<HTMLElement>('input, textarea, select')?.focus()
    else dialog?.focus()
    return () => dialog?.close()
  }, [focusFirstField])

  return (
    <dialog
      ref={ref}
      tabIndex={-1}
      aria-label={label}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onPointerDown={(event) => {
        pressedBackdrop.current = event.target === event.currentTarget
      }}
      onClick={(event) => {
        if (pressedBackdrop.current && event.target === event.currentTarget) onClose()
      }}
      className={cx(
        'm-auto max-h-[calc(100vh-2rem)] overflow-y-auto rounded-xl bg-white p-0 text-stone-900 shadow-2xl backdrop:bg-stone-900/30 focus:outline-none',
        size === 'large' ? 'w-[min(56rem,calc(100vw-2rem))]' : 'w-[min(34rem,calc(100vw-2rem))]',
      )}
    >
      {children}
    </dialog>
  )
}

export function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Close"
      onClick={onClick}
      className="ml-auto shrink-0 rounded-md px-2 py-1 text-lg leading-none text-stone-500 hover:bg-stone-100"
    >
      ✕
    </button>
  )
}
