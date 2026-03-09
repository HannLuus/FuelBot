import { useTranslation } from 'react-i18next'
import { clsx } from 'clsx'
import { useFilterStore } from '@/stores/filterStore'
import { useB2BEntitlements } from '@/hooks/useB2BEntitlements'
import { FUEL_CODES, FUEL_DISPLAY } from '@/lib/fuelUtils'
import { DISTANCE_OPTIONS_KM, WHOLE_COUNTRY_KM } from '@/lib/constants'
import type { FuelCode, StatusFilter } from '@/types'

const STATUS_OPTIONS: { value: StatusFilter; labelKey: string }[] = [
  { value: 'ALL', labelKey: 'home.filters.allStatuses' },
  { value: 'HAS_FUEL', labelKey: 'home.filters.hasFuel' },
  { value: 'LIMITED', labelKey: 'home.filters.limited' },
  { value: 'OUT', labelKey: 'home.filters.empty' },
]

const DISTANCE_LABEL_KEYS: Record<number, string> = {
  5: 'home.filters.distance5',
  25: 'home.filters.distance25',
}

export function FilterBar() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'en' | 'my'
  const { filters, setFuelTypes, setStatusFilter, setMaxDistance, setSelectedRouteId } = useFilterStore()
  const { hasNationalView, routes } = useB2BEntitlements()

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
                  : 'bg-gray-100 text-gray-700 active:bg-gray-200',
              )}
            >
              {t(labelKey)}
            </button>
          )
        })}

        {/* Divider */}
        <div className="shrink-0 h-5 w-px bg-gray-200 mx-1" />

        {/* Distance: free tier options */}
        {DISTANCE_OPTIONS_KM.map((km) => {
          const active = filters.maxDistanceKm === km
          return (
            <button
              key={km}
              type="button"
              onClick={() => setMaxDistance(km)}
              className={clsx(
                'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                active
                  ? 'bg-emerald-600 text-white active:bg-emerald-700'
                  : 'bg-gray-100 text-gray-700 active:bg-gray-200',
              )}
            >
              {t(DISTANCE_LABEL_KEYS[km])}
            </button>
          )
        })}

        {/* B2B: All Myanmar — always visible; active only when entitled */}
        <button
          type="button"
          title={!hasNationalView ? t('home.filters.wholeCountryB2BOnly') : undefined}
          disabled={!hasNationalView}
          onClick={() => {
            if (!hasNationalView) return
            setSelectedRouteId(null)
            setMaxDistance(WHOLE_COUNTRY_KM)
          }}
          className={clsx(
            'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
            !hasNationalView && 'cursor-not-allowed opacity-70',
            hasNationalView && filters.maxDistanceKm >= WHOLE_COUNTRY_KM && !filters.selectedRouteId
              ? 'bg-amber-600 text-white active:bg-amber-700'
              : hasNationalView
                ? 'bg-gray-100 text-gray-700 active:bg-gray-200'
                : 'bg-gray-100 text-gray-400',
          )}
        >
          {t('home.filters.wholeCountry')}
        </button>

        {/* B2B: Route selector (only when entitled to at least one route) */}
        {routes.length > 0 && (
          <select
            value={filters.selectedRouteId ?? ''}
            onChange={(e) => setSelectedRouteId(e.target.value || null)}
            className="shrink-0 rounded-full border border-gray-200 bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
            aria-label={t('home.filters.selectRoute')}
          >
            <option value="">{t('home.filters.selectRoute')}</option>
            {routes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  )
}
