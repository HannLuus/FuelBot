import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { haversineDistanceMetres } from '@/lib/fuelUtils'
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
  const [stations, setStations] = useState<StationWithStatus[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchStations = useCallback(async () => {
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
      setStations(results)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [lat, lng, maxDistanceKm, selectedRouteId, fuelTypes, statusFilter])

  useEffect(() => {
    void fetchStations()
  }, [fetchStations])

  // Realtime subscription for live updates
  useEffect(() => {
    const channel = supabase
      .channel('station_status_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'station_current_status' },
        () => void fetchStations(),
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [fetchStations])

  return { stations, loading, error, refresh: fetchStations }
}

export function useStationDetail(stationId: string) {
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
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [stationId])

  useEffect(() => {
    void fetch()
  }, [fetch])

  return { station, reports, loading, error, refresh: fetch }
}

// Fallback for when PostGIS RPC is unavailable: load all active stations and compute distance client-side
export async function fetchStationsFallback(
  lat: number,
  lng: number,
  maxDistanceKm: number,
): Promise<StationWithStatus[]> {
  const { data, error } = await supabase
    .from('stations')
    .select('*, current_status:station_current_status(*)')
    .eq('is_active', true)
    .eq('country_code', 'MM')

  if (error) throw error

  return ((data ?? []) as StationWithStatus[])
    .map((s) => ({
      ...s,
      distance_m: haversineDistanceMetres(lat, lng, s.lat, s.lng),
    }))
    .filter((s) => (s.distance_m ?? Infinity) <= maxDistanceKm * 1000)
    .sort((a, b) => (a.distance_m ?? 0) - (b.distance_m ?? 0))
}
