// Spans rather than divs, so it can sit inside a button (the sidebar cards).
export function ProgressBar({ percent, color }: { percent: number; color: string }) {
  return (
    <span
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      className="block h-1.5 flex-1 overflow-hidden rounded-full bg-stone-200"
    >
      <span className="block h-full rounded-full" style={{ width: `${percent}%`, background: color }} />
    </span>
  )
}
