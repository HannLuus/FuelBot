import { useEffect, useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { haversineDistanceMetres, isStationVisible } from '@/lib/fuelUtils'
import { WHOLE_COUNTRY_KM } from '@/lib/constants'
import type { StationWithStatus, FuelCode, StatusFilter } from '@/types'

interface UseNearbyStationsArgs {
  lat: number
  lng: number
  maxDistanceKm: number
  /** When set, B2B route view: fetch stations along this route only. */
  selectedRouteId: string | null
  fuelTypes: FuelCode[]
  statusFilter: StatusFilter
}

interface UseNearbyStationsResult {
  stations: StationWithStatus[]
  loading: boolean
  error: string | null
  refresh: () => void
}

export function useNearbyStations({
  lat,
  lng,
  maxDistanceKm,
  selectedRouteId,
  fuelTypes,
  statusFilter,
}: UseNearbyStationsArgs): UseNearbyStationsResult {
  const { t } = useTranslation()
  const [stations, setStations] = useState<StationWithStatus[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Stale-fetch guard: each call increments the counter; only the most recent call writes state.
  const fetchIdRef = useRef(0)

  const fetchStations = useCallback(async () => {
    const thisFetchId = ++fetchIdRef.current
    setLoading(true)
    setError(null)

    try {
      let results: StationWithStatus[]

      if (selectedRouteId) {
        // B2B route view: RPC checks entitlement server-side
        const { data, error: dbError } = await supabase.rpc('get_stations_along_route', {
          p_route_id: selectedRouteId,
        })
        if (dbError) throw dbError
        const raw = (data ?? []) as (StationWithStatus & { distance_m?: number })[]
        results = raw.map((row) => ({
          ...row,
          distance_m: haversineDistanceMetres(lat, lng, row.lat, row.lng),
        }))
      } else if (maxDistanceKm >= WHOLE_COUNTRY_KM) {
        // B2B national view: RPC checks entitlement server-side
        const { data, error: dbError } = await supabase.rpc('get_all_stations_national')
        if (dbError) throw dbError
        const raw = (data ?? []) as (StationWithStatus & { distance_m?: number })[]
        results = raw.map((row) => ({
          ...row,
          distance_m: haversineDistanceMetres(lat, lng, row.lat, row.lng),
        }))
      } else {
        // Radius-based: existing PostGIS RPC
        const { data, error: dbError } = await supabase.rpc('get_nearby_stations', {
          user_lat: lat,
          user_lng: lng,
          radius_km: maxDistanceKm,
        })
        if (dbError) throw dbError
        results = (data ?? []).map(
          (row: StationWithStatus & { distance_m: number }) => ({
            ...row,
            distance_m: row.distance_m,
          }),
        )
      }

      // Client-side fuel type filter
      if (fuelTypes.length > 0) {
        results = results.filter((s) => {
          const fs = s.current_status?.fuel_statuses_computed ?? {}
          return fuelTypes.some((ft) => ft in fs)
        })
      }

      // Client-side status filter
      if (statusFilter !== 'ALL') {
        results = results.filter((s) => {
          const fs = s.current_status?.fuel_statuses_computed ?? {}
          const values = Object.values(fs)
          if (statusFilter === 'HAS_FUEL') return values.includes('AVAILABLE')
          if (statusFilter === 'LIMITED') return values.includes('LIMITED')
          if (statusFilter === 'OUT')
            return values.length > 0 && values.every((v) => v === 'OUT')
          return true
        })
      }

      results.sort((a, b) => (a.distance_m ?? 0) - (b.distance_m ?? 0))

      // Discard result if a newer fetch has already started
      if (thisFetchId !== fetchIdRef.current) return
      setStations(results)
    } catch (err) {
      if (thisFetchId !== fetchIdRef.current) return
      setError(err instanceof TypeError ? t('errors.network') : t('errors.generic'))
    } finally {
      if (thisFetchId === fetchIdRef.current) setLoading(false)
    }
  }, [fuelTypes, lat, lng, maxDistanceKm, selectedRouteId, statusFilter, t])

  useEffect(() => {
    void fetchStations()
  }, [fetchStations])

  // Keep latest stations in a ref so Realtime callback can do a surgical update without stale closure
  const stationsRef = useRef(stations)
  stationsRef.current = stations

  // Realtime subscription only when logged in. Performs surgical in-place status update instead of
  // a full refetch so B2B national view users don't re-download hundreds of stations on every change.
  const user = useAuthStore((s) => s.user)
  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel('station_status_changes')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'station_current_status' },
        (payload) => {
          const updated = payload.new as unknown as StationWithStatus['current_status']
          if (!updated) return
          setStations((prev) =>
            prev.map((s) =>
              s.id === (updated as { station_id?: string })?.station_id
                ? { ...s, current_status: updated }
                : s,
            ),
          )
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' && channel) {
          void supabase.removeChannel(channel)
        }
      })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [user])

  return { stations, loading, error, refresh: fetchStations }
}

export function useStationDetail(stationId: string) {
  const { t } = useTranslation()
  const [station, setStation] = useState<StationWithStatus | null>(null)
  const [reports, setReports] = useState<import('@/types').StationStatusReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    try {
      const [stationRes, reportsRes] = await Promise.all([
        supabase
          .from('stations')
          .select('*, current_status:station_current_status(*)')
          .eq('id', stationId)
          .single(),
        supabase
          .from('station_status_reports')
          .select('*')
          .eq('station_id', stationId)
          .eq('is_flagged', false)
          .order('reported_at', { ascending: false })
          .limit(5),
      ])

      if (stationRes.error) throw stationRes.error
      setStation(stationRes.data as StationWithStatus)
      setReports(reportsRes.data ?? [])
    } catch (err) {
      setError(err instanceof TypeError ? t('errors.network') : t('errors.generic'))
    } finally {
      setLoading(false)
    }
  }, [stationId, t])

  useEffect(() => {
    void fetch()
  }, [fetch])

  return { station, reports, loading, error, refresh: fetch }
}

// Fallback for when PostGIS RPC is unavailable: load stations within a bounding box and compute distance client-side.
// The bounding box pre-filter avoids pulling the entire stations table into the browser.
export async function fetchStationsFallback(
  lat: number,
  lng: number,
  maxDistanceKm: number,
): Promise<StationWithStatus[]> {
  const degLat = maxDistanceKm / 111.0
  const degLng = maxDistanceKm / (111.0 * Math.cos((lat * Math.PI) / 180))

  const { data, error } = await supabase
    .from('stations')
    .select('*, current_status:station_current_status(*)')
    .eq('is_active', true)
    .eq('country_code', 'MM')
    .gte('lat', lat - degLat)
    .lte('lat', lat + degLat)
    .gte('lng', lng - degLng)
    .lte('lng', lng + degLng)

  if (error) throw error

  return ((data ?? []) as StationWithStatus[])
    .filter(isStationVisible)
    .map((s) => ({
      ...s,
      distance_m: haversineDistanceMetres(lat, lng, s.lat, s.lng),
    }))
    .filter((s) => (s.distance_m ?? Infinity) <= maxDistanceKm * 1000)
    .sort((a, b) => (a.distance_m ?? 0) - (b.distance_m ?? 0))
}
