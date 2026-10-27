import type { Platform } from '../types'

// Simple drawn glyphs rather than brand logos; they take the text color.
export function PlatformIcon({ platform, className }: { platform: Platform; className?: string }) {
  if (platform === 'youtube') {
    return (
      <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
        <rect x="1" y="3" width="14" height="10" rx="3" fill="currentColor" />
        <path d="M6.5 5.6v4.8L10.6 8z" fill="white" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
      <rect x="2" y="2" width="12" height="12" rx="3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8" cy="8" r="2.75" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="11.5" cy="4.5" r="0.9" fill="currentColor" />
    </svg>
  )
}
