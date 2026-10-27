export function ProgressBar({ percent, color }: { percent: number; color: string }) {
  return (
    <div
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-200"
    >
      <div className="h-full rounded-full" style={{ width: `${percent}%`, background: color }} />
    </div>
  )
}
