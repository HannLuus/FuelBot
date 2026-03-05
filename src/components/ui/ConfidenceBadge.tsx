import { clsx } from 'clsx'

interface ConfidenceBadgeProps {
  score: number // 0–1
  className?: string
}

export function ConfidenceBadge({ score, className }: ConfidenceBadgeProps) {
  const pct = Math.round(score * 100)
  const color =
    pct >= 70 ? 'text-green-600' : pct >= 40 ? 'text-yellow-600' : 'text-red-500'

  return (
    <span className={clsx('text-xs font-medium', color, className)}>
      {pct}%
    </span>
  )
}
