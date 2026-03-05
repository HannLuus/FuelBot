import { clsx } from 'clsx'
import { useTranslation } from 'react-i18next'
import { STATUS_COLORS } from '@/lib/fuelUtils'
import { FUEL_DISPLAY } from '@/lib/fuelUtils'
import type { FuelCode, FuelStatus } from '@/types'

interface FuelChipProps {
  code: FuelCode
  status: FuelStatus
  size?: 'sm' | 'md'
}

export function FuelChip({ code, status, size = 'md' }: FuelChipProps) {
  const { i18n } = useTranslation()
  const lang = i18n.language as 'en' | 'my'
  const label = FUEL_DISPLAY[code][lang] ?? FUEL_DISPLAY[code].en

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full font-semibold',
        STATUS_COLORS[status],
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm',
      )}
      aria-label={`${label}: ${status}`}
    >
      <span
        className={clsx(
          'rounded-full',
          size === 'sm' ? 'h-1.5 w-1.5' : 'h-2 w-2',
          status === 'AVAILABLE' && 'bg-white/70',
          status === 'LIMITED' && 'bg-black/30',
          status === 'OUT' && 'bg-white/70',
          status === 'UNKNOWN' && 'bg-gray-500',
        )}
      />
      {label}
    </span>
  )
}
