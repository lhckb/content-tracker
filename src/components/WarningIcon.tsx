// A warning triangle with an exclamation mark. Takes the text color.
export function WarningIcon({ className }: { className?: string }) {
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
      <path d="M7.13 2.5a1 1 0 0 1 1.74 0l5.5 9.75a1 1 0 0 1-.87 1.5h-11a1 1 0 0 1-.87-1.5z" />
      <path d="M8 6.25v3" />
      <path d="M8 11.5h.01" />
    </svg>
  )
}
