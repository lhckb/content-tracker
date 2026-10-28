// A small broom marking clean-up tasks. Takes the text color.
export function CleanupIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14.25 1.75 9 7" />
      <path d="M6.75 6.25 9.75 9.25 8.5 13c-1.75 1-4.25 1.25-6.25 1-.25-2 0-4.5 1-6.25z" />
      <path d="M5 12.5 7 10.5" />
    </svg>
  )
}
