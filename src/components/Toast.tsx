import { useEffect } from 'react'

// A short message at the bottom of the screen that clears itself.
export function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    if (!message) return
    const timer = setTimeout(onDismiss, 5000)
    return () => clearTimeout(timer)
  }, [message, onDismiss])

  return (
    // At phone width, above the tab bar and the home bar.
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] flex justify-center px-4 md:bottom-4"
    >
      {message && (
        <p className="pointer-events-auto rounded-md bg-stone-900 px-4 py-2 text-sm text-white shadow-lg">
          {message}
        </p>
      )}
    </div>
  )
}
