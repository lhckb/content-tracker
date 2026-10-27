import { useEffect } from 'react'

// A short message at the bottom of the screen that clears itself.
export function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    if (!message) return
    const timer = setTimeout(onDismiss, 5000)
    return () => clearTimeout(timer)
  }, [message, onDismiss])

  return (
    <div role="status" className="pointer-events-none fixed inset-x-0 bottom-4 flex justify-center">
      {message && (
        <p className="pointer-events-auto rounded-md bg-stone-900 px-4 py-2 text-sm text-white shadow-lg">
          {message}
        </p>
      )}
    </div>
  )
}
