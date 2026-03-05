import { clsx } from 'clsx'
import type { ButtonHTMLAttributes } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={clsx(
        // Base: always meets 44px minimum tap target, no tap delay
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold',
        'transition-all select-none touch-manipulation',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        // Strong active feedback for sunlight / touch use
        'active:scale-[0.96] active:brightness-90',
        // Sizes — all meet 44px height minimum
        size === 'sm' && 'min-h-[44px] px-4 py-2.5 text-sm',
        size === 'md' && 'min-h-[48px] px-5 py-3 text-base',
        size === 'lg' && 'min-h-[56px] px-6 py-4 text-lg',
        // Variants
        variant === 'primary' && 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800',
        variant === 'secondary' && 'bg-gray-100 text-gray-900 hover:bg-gray-200 active:bg-gray-300',
        variant === 'ghost' && 'bg-transparent text-gray-700 hover:bg-gray-100 active:bg-gray-200',
        variant === 'danger' && 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800',
        className,
      )}
    >
      {loading && (
        <svg
          className="h-5 w-5 animate-spin"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
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
      )}
      {children}
    </button>
  )
}
