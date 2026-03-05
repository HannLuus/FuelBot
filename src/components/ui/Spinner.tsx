import { clsx } from 'clsx'

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={clsx('animate-spin', className ?? 'h-5 w-5 text-blue-600')}
      viewBox="0 0 24 24"
      fill="none"
      aria-label="Loading"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v8H4z"
      />
    </svg>
  )
}
