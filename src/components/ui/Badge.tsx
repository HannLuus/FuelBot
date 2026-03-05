import { clsx } from 'clsx'

interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'verified' | 'stale' | 'warning'
  className?: string
}

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        variant === 'default' && 'bg-gray-100 text-gray-700',
        variant === 'verified' && 'bg-blue-100 text-blue-700',
        variant === 'stale' && 'bg-orange-100 text-orange-700',
        variant === 'warning' && 'bg-yellow-100 text-yellow-800',
        className,
      )}
    >
      {children}
    </span>
  )
}
