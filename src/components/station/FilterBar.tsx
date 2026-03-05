import { useTranslation } from 'react-i18next'
import { clsx } from 'clsx'
import { useFilterStore } from '@/stores/filterStore'
import { FUEL_CODES, FUEL_DISPLAY } from '@/lib/fuelUtils'
import type { FuelCode, StatusFilter } from '@/types'

const STATUS_OPTIONS: { value: StatusFilter; labelKey: string }[] = [
  { value: 'ALL', labelKey: 'home.filters.allStatuses' },
  { value: 'HAS_FUEL', labelKey: 'home.filters.hasFuel' },
  { value: 'LIMITED', labelKey: 'home.filters.limited' },
  { value: 'OUT', labelKey: 'home.filters.empty' },
]

export function FilterBar() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'en' | 'my'
  const { filters, setFuelTypes, setStatusFilter } = useFilterStore()

  function toggleFuelType(code: FuelCode) {
    if (filters.fuelTypes.includes(code)) {
      setFuelTypes(filters.fuelTypes.filter((c) => c !== code))
    } else {
      setFuelTypes([...filters.fuelTypes, code])
    }
  }

  return (
    <div className="shrink-0 border-b border-gray-100 bg-white">
      {/* Single scrollable row — all filters in one line saves vertical space */}
      <div className="flex items-center gap-2 overflow-x-auto px-4 py-2.5 hide-scrollbar">
        {/* Fuel type pills */}
        {FUEL_CODES.map((code) => {
          const active = filters.fuelTypes.includes(code)
          return (
            <button
              key={code}
              onClick={() => toggleFuelType(code)}
              className={clsx(
                'shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors',
                active
                  ? 'bg-blue-600 text-white active:bg-blue-700'
                  : 'bg-gray-100 text-gray-700 active:bg-gray-200',
              )}
            >
              {FUEL_DISPLAY[code][lang]}
            </button>
          )
        })}

        {/* Divider */}
        <div className="shrink-0 h-5 w-px bg-gray-200 mx-1" />

        {/* Status filters */}
        {STATUS_OPTIONS.map(({ value, labelKey }) => {
          const active = filters.statusFilter === value
          return (
            <button
              key={value}
              onClick={() => setStatusFilter(value)}
              className={clsx(
                'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                active
                  ? 'bg-gray-800 text-white active:bg-gray-900'
                  : 'bg-gray-100 text-gray-600 active:bg-gray-200',
              )}
            >
              {t(labelKey)}
            </button>
          )
        })}
      </div>
    </div>
  )
}
