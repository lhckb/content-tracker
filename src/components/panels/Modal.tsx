import { useEffect, useRef, type ReactNode } from 'react'
import { cx } from '../cx'

// A card over the calendar, built on <dialog> for focus handling and Escape.
// Clicking the dimmed backdrop closes it. Focus starts on the card itself,
// so a stray keypress can't edit the first field, unless `focus` names the
// element to start on (a CSS selector).
export function Modal({
  label,
  size,
  focus,
  onClose,
  children,
}: {
  label: string
  // At phone width, 'small' and 'large' cards fill the screen; an 'alert'
  // (a yes/no question) stays a small centered card everywhere.
  size: 'alert' | 'small' | 'large'
  focus?: string
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
    const target = focus ? dialog?.querySelector<HTMLElement>(focus) : dialog
    target?.focus()
    return () => dialog?.close()
  }, [focus])

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
        'm-auto max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-xl bg-white p-0 text-stone-900 shadow-2xl backdrop:bg-stone-900/30 focus:outline-none',
        size === 'alert'
          ? 'w-[min(28rem,calc(100vw-2rem))]'
          : cx(
              'max-md:h-dvh max-md:max-h-dvh max-md:w-full max-md:max-w-full max-md:rounded-none max-md:pt-[env(safe-area-inset-top)] max-md:pb-[env(safe-area-inset-bottom)]',
              size === 'large' ? 'md:w-[min(56rem,calc(100vw-2rem))]' : 'md:w-[min(34rem,calc(100vw-2rem))]',
            ),
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
      className="ml-auto shrink-0 rounded-md px-2 py-1 text-lg leading-none text-stone-500 hover:bg-stone-100 max-md:grid max-md:size-11 max-md:place-items-center max-md:p-0"
    >
      ✕
    </button>
  )
}
