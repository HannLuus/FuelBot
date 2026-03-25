import { useState, useEffect, useRef, useId } from 'react'
import { useTranslation } from 'react-i18next'
import { clsx } from 'clsx'
import { Menu } from 'lucide-react'
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
  const { filters, setFuelTypes, setStatusFilter, setMaxDistance, setSelectedRouteId, setVerifiedOnly } = useFilterStore()
  const { hasNationalView, routes } = useB2BEntitlements()
  const [filterMenuOpen, setFilterMenuOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const routeSelectId = useId()

  useEffect(() => {
    if (!filterMenuOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFilterMenuOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [filterMenuOpen])

  useEffect(() => {
    if (!filterMenuOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setFilterMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [filterMenuOpen])

  useEffect(() => {
    if (filters.selectedRouteId != null && !routes.some((route) => route.id === filters.selectedRouteId)) {
      setSelectedRouteId(null)
    }
  }, [filters.selectedRouteId, routes, setSelectedRouteId])

  useEffect(() => {
    const usingWholeCountry = filters.maxDistanceKm >= WHOLE_COUNTRY_KM && !filters.selectedRouteId
    if (!hasNationalView && usingWholeCountry) {
      setMaxDistance(25)
    }
  }, [filters.maxDistanceKm, filters.selectedRouteId, hasNationalView, setMaxDistance])

  /** One fuel at a time (typical driver has one vehicle). Tap active pill again to show all types. */
  function toggleFuelType(code: FuelCode) {
    if (filters.fuelTypes.length === 1 && filters.fuelTypes[0] === code) {
      setFuelTypes([])
    } else {
      setFuelTypes([code])
    }
  }

  const statusAndMoreFilters = (
    <>
      {/* Status filters */}
      {STATUS_OPTIONS.map(({ value, labelKey }) => {
        const active = filters.statusFilter === value
        return (
          <button
            key={value}
            type="button"
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

      {/* Verified only */}
      <button
        type="button"
        title={t('home.filters.verifiedOnlyHint')}
        onClick={() => setVerifiedOnly(!filters.verifiedOnly)}
        className={clsx(
          'shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
          filters.verifiedOnly
            ? 'bg-green-600 text-white active:bg-green-700'
            : 'bg-gray-100 text-gray-700 active:bg-gray-200',
        )}
      >
        {t('home.filters.verifiedOnly')}
      </button>

      {/* Divider */}
      <div className="shrink-0 h-5 w-px bg-gray-200 mx-1" />

      {/* Distance */}
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

      {/* B2B: All Myanmar */}
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

      {/* B2B: Route selector */}
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
    </>
  )

  return (
    <div ref={dropdownRef} className="shrink-0 border-b border-gray-100 bg-white relative">
      <div className="flex items-center gap-2 overflow-x-auto px-4 py-2.5 hide-scrollbar">
        {/* Fuel type pills — always visible */}
        {FUEL_CODES.map((code) => {
          const active = filters.fuelTypes.length === 1 && filters.fuelTypes[0] === code
          return (
            <button
              key={code}
              type="button"
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

        {/* Desktop: status + verified + distance + B2B inline */}
        <div className="hidden md:flex items-center gap-2 shrink-0">
          {statusAndMoreFilters}
        </div>

        {/* Mobile: hamburger at far right — dropdown is rendered outside this row to avoid overflow clipping */}
        <div className="flex md:hidden items-center shrink-0 ml-auto">
          <button
            type="button"
            onClick={() => setFilterMenuOpen((open) => !open)}
            className={clsx(
              'flex items-center justify-center min-h-[36px] min-w-[44px] rounded-full active:bg-gray-900',
              filterMenuOpen ? 'bg-gray-900 text-white' : 'bg-gray-800 text-white',
            )}
            aria-label={t('home.filters.moreFilters')}
            aria-expanded={filterMenuOpen}
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Dropdown: outside overflow-x-auto so it isn't clipped; right-aligned, extends inwards */}
      {filterMenuOpen && (
        <div
          role="menu"
          aria-label={t('home.filters.moreFilters')}
          className="absolute right-4 top-full z-50 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-gray-200 bg-white py-2 shadow-lg md:hidden"
        >
          <div className="flex flex-col gap-2 px-3 py-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-700 pt-0.5">
                  {t('home.filters.moreFilters')}
                </p>
                {/* Status */}
                <div className="flex flex-wrap gap-1.5">
                  {STATUS_OPTIONS.map(({ value, labelKey }) => {
                    const active = filters.statusFilter === value
                    return (
                      <button
                        key={value}
                        type="button"
                        role="menuitem"
                        onClick={() => setStatusFilter(value)}
                        className={clsx(
                          'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                          active
                            ? 'bg-gray-800 text-white active:bg-gray-900'
                            : 'bg-gray-100 text-gray-700 active:bg-gray-200',
                        )}
                      >
                        {t(labelKey)}
                      </button>
                    )
                  })}
                </div>
                {/* Verified only */}
                <button
                  type="button"
                  role="menuitem"
                  title={t('home.filters.verifiedOnlyHint')}
                  onClick={() => setVerifiedOnly(!filters.verifiedOnly)}
                  className={clsx(
                    'w-full rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors',
                    filters.verifiedOnly
                      ? 'bg-green-600 text-white active:bg-green-700'
                      : 'bg-gray-100 text-gray-700 active:bg-gray-200',
                  )}
                >
                  {t('home.filters.verifiedOnly')}
                </button>
                {/* Distance */}
                <div className="flex flex-wrap gap-1.5">
                  {DISTANCE_OPTIONS_KM.map((km) => {
                    const active = filters.maxDistanceKm === km
                    return (
                      <button
                        key={km}
                        type="button"
                        role="menuitem"
                        onClick={() => setMaxDistance(km)}
                        className={clsx(
                          'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                          active
                            ? 'bg-emerald-600 text-white active:bg-emerald-700'
                            : 'bg-gray-100 text-gray-700 active:bg-gray-200',
                        )}
                      >
                        {t(DISTANCE_LABEL_KEYS[km])}
                      </button>
                    )
                  })}
                </div>
                {/* All Myanmar */}
                <button
                  type="button"
                  role="menuitem"
                  title={!hasNationalView ? t('home.filters.wholeCountryB2BOnly') : undefined}
                  disabled={!hasNationalView}
                  onClick={() => {
                    if (!hasNationalView) return
                    setSelectedRouteId(null)
                    setMaxDistance(WHOLE_COUNTRY_KM)
                  }}
                  className={clsx(
                    'w-full rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors',
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
                {/* Route */}
                {routes.length > 0 && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-700" htmlFor={routeSelectId}>
                      {t('home.filters.selectRoute')}
                    </label>
                    <select
                      id={routeSelectId}
                      value={filters.selectedRouteId ?? ''}
                      onChange={(e) => setSelectedRouteId(e.target.value || null)}
                      className="w-full rounded-lg border border-gray-200 bg-gray-100 px-2.5 py-2 text-sm font-medium text-gray-700 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      <option value="">{t('home.filters.selectRoute')}</option>
                      {routes.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
          </div>
        </div>
      )}
    </div>
  )
}
