import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MapPin, RefreshCw, X, Trophy } from 'lucide-react'
import { useLocationStore } from '@/stores/locationStore'
import { useFilterStore } from '@/stores/filterStore'
import { useNearbyStations } from '@/hooks/useNearbyStations'
import { useAuthStore } from '@/stores/authStore'
import { WHOLE_COUNTRY_KM } from '@/lib/constants'
import { isStationVerified } from '@/lib/fuelUtils'
import { StationCard } from '@/components/station/StationCard'
import { FilterBar } from '@/components/station/FilterBar'
import { Spinner } from '@/components/ui/Spinner'
import { Button } from '@/components/ui/Button'
import { supabase } from '@/lib/supabase'

interface MyStats {
  report_count: number
  rank: number
  total_reporters: number
}

// Default to central Yangon when location is unavailable
const YANGON_LAT = 16.8661
const YANGON_LNG = 96.1561

export function HomePage() {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const {
    lat,
    lng,
    loading: locLoading,
    error: locError,
    requestLocation,
    checkPermission,
    permissionChecked,
    clearError,
  } = useLocationStore()
  const { filters } = useFilterStore()
  const [myStats, setMyStats] = useState<MyStats | null>(null)

  useEffect(() => {
    if (!user) { setMyStats(null); return }
    void (async () => {
      const { data } = await supabase.rpc('get_my_reporter_stats', { period_days: 30 })
      const row = (data as MyStats[] | null)?.[0]
      if (row && Number(row.report_count) > 0) setMyStats(row)
    })()
  }, [user])

  // Only auto-request location when permission was already granted (e.g. returning user).
  // Chrome on Android requires the first request to be from a user gesture; auto-request on load fails.
  useEffect(() => {
    let cancelled = false
    checkPermission({
      onGranted: () => {
        if (!cancelled) requestLocation({ highAccuracy: true })
      },
    })
    return () => {
      cancelled = true
    }
  }, [checkPermission, requestLocation])

  // Use user location when available, fall back to Yangon so the list is never empty
  const effectiveLat = lat ?? YANGON_LAT
  const effectiveLng = lng ?? YANGON_LNG
  // National view always uses selected radius; otherwise when no location use 25 km fallback
  const effectiveRadius =
    filters.maxDistanceKm >= WHOLE_COUNTRY_KM ? filters.maxDistanceKm : lat !== null ? filters.maxDistanceKm : 25

  const { stations, loading, error, refresh } = useNearbyStations({
    lat: effectiveLat,
    lng: effectiveLng,
    maxDistanceKm: effectiveRadius,
    selectedRouteId: filters.selectedRouteId,
    fuelTypes: filters.fuelTypes,
    statusFilter: filters.statusFilter,
  })

  const filteredStations = filters.verifiedOnly ? stations.filter(isStationVerified) : stations
  const showLocationBanner = !!locError && !locLoading
  const showUseMyLocationCta =
    permissionChecked && lat === null && !locLoading && !locError

  return (
    <div className="flex h-full flex-col">
      <FilterBar />

      {/* Reporter stats strip — only when user has reported this month */}
      {myStats && (
        <div className="shrink-0 flex items-center gap-2 border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          <Trophy className="h-3.5 w-3.5 shrink-0 text-amber-500" />
          <span className="font-semibold">{t('home.yourStatsThisMonth')}: {myStats.report_count}</span>
          {Number(myStats.rank) > 0 && (
            <span className="ml-1 text-amber-700">
              · {t('home.yourRank', { rank: myStats.rank })}
            </span>
          )}
        </div>
      )}

      {/* Use my location CTA — first-time users must tap (Chrome requires user gesture for geolocation) */}
      {showUseMyLocationCta && (
        <div className="shrink-0 flex items-center gap-2 bg-blue-50 px-4 py-2.5 text-xs text-blue-800 dark:bg-blue-950/80 dark:text-blue-200">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">{t('home.useMyLocationHint')}</span>
          <button
            type="button"
            onClick={() => requestLocation({ highAccuracy: true })}
            className="shrink-0 flex items-center gap-1 rounded-full bg-blue-600 px-3 py-1.5 font-semibold text-white active:bg-blue-700 dark:bg-blue-500 dark:active:bg-blue-600"
          >
            {t('home.useMyLocation')}
          </button>
        </div>
      )}

      {/* Location denied banner — slim, non-blocking */}
      {showLocationBanner && (
        <div className="shrink-0 flex items-center gap-2 bg-orange-50 px-4 py-2.5 text-xs text-orange-700">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">{t('home.locationDenied')}</span>
          <button
            type="button"
            onClick={() => requestLocation({ highAccuracy: true })}
            className="flex shrink-0 items-center gap-1 font-semibold underline underline-offset-2"
          >
            {t('home.tryAgain')}
          </button>
          <button
            type="button"
            onClick={clearError}
            className="ml-1 flex shrink-0 items-center justify-center rounded-full p-1 hover:bg-orange-100 active:bg-orange-200"
            aria-label={t('common.close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto scroll-touch">
        {/* Initial location loading */}
        {locLoading && filteredStations.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-700">
            <Spinner />
            <span className="text-sm">{t('home.loading')}</span>
          </div>
        )}

        {/* Data loading (after location resolved) */}
        {!locLoading && loading && filteredStations.length === 0 && (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        )}

        {/* Data error */}
        {!loading && error && (
          <div className="mx-4 mt-6 rounded-2xl bg-red-50 p-5 text-center">
            <p className="text-sm text-red-700">{t('errors.network')}</p>
            <Button size="sm" variant="secondary" className="mt-3" onClick={refresh}>
              <RefreshCw className="h-4 w-4" />
              Retry
            </Button>
          </div>
        )}

        {/* Station list */}
        {!error && (
          <div className="space-y-3 p-4">
            {filters.maxDistanceKm >= WHOLE_COUNTRY_KM && filteredStations.length > 0 && (
              <p className="text-xs text-gray-500 pb-1">
                {t('home.showingAllStations')}
              </p>
            )}
            {!loading && filteredStations.length === 0 && !locLoading && (
              <div className="py-12 text-center">
                <p className="text-gray-700">{t('home.noStations')}</p>
                <p className="mt-1 text-xs text-gray-700">
                  {filters.verifiedOnly ? t('home.filters.verifiedOnlyHint') : t('home.noStationsHint')}
                </p>
              </div>
            )}
            {filteredStations.map((station) => (
              <StationCard key={station.id} station={station} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
