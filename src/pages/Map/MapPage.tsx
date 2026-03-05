import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import L from 'leaflet'
import { Crosshair, Sun, Moon } from 'lucide-react'
import { useLocationStore } from '@/stores/locationStore'
import { useFilterStore } from '@/stores/filterStore'
import { useMapStyleStore, type MapStyle } from '@/stores/mapStyleStore'
import { useNearbyStations } from '@/hooks/useNearbyStations'
import { STATUS_DOT_COLORS, worstStatus } from '@/lib/fuelUtils'
import type { StationWithStatus } from '@/types'

const CARTO_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'

function makeTileLayer(style: MapStyle): L.TileLayer {
  const url =
    style === 'dark'
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'
      : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'
  return L.tileLayer(url, {
    subdomains: 'abcd',
    maxZoom: 20,
    attribution: CARTO_ATTRIBUTION,
  })
}

// Default to central Yangon when location is unavailable
const YANGON_LAT = 16.8661
const YANGON_LNG = 96.1561

const STATUS_HEX: Record<string, string> = {
  AVAILABLE: '#22c55e',
  LIMITED: '#facc15',
  OUT: '#ef4444',
  UNKNOWN: '#9ca3af',
}

function makeMarkerIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:18px; height:18px; border-radius:50%;
      background:${color}; border:2.5px solid white;
      box-shadow:0 1px 4px rgba(0,0,0,0.35);
    "></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  })
}

export function MapPage() {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markersRef = useRef<L.Marker[]>([])
  const tileLayerRef = useRef<L.TileLayer | null>(null)
  const userLocationLayerRef = useRef<L.CircleMarker | null>(null)
  const navigate = useNavigate()
  const { lat, lng, requestLocation, loading: locationLoading } = useLocationStore()
  const { filters } = useFilterStore()
  const { mapStyle, setMapStyle } = useMapStyleStore()

  const effectiveLat = lat ?? YANGON_LAT
  const effectiveLng = lng ?? YANGON_LNG

  const { stations } = useNearbyStations({
    lat: effectiveLat,
    lng: effectiveLng,
    maxDistanceKm: lat !== null ? filters.maxDistanceKm : 25,
    fuelTypes: filters.fuelTypes,
    statusFilter: filters.statusFilter,
  })

  // Initialise Leaflet map once
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    mapRef.current = L.map(mapContainerRef.current, {
      center: [effectiveLat, effectiveLng],
      zoom: 14,
      zoomControl: true,
    })

    const initialStyle = useMapStyleStore.getState().mapStyle
    const layer = makeTileLayer(initialStyle).addTo(mapRef.current)
    tileLayerRef.current = layer

    if (lat != null && lng != null) {
      const circle = L.circleMarker([lat, lng], {
        radius: 8,
        fillColor: '#3b82f6',
        color: '#fff',
        weight: 2,
        fillOpacity: 1,
      })
        .addTo(mapRef.current)
        .bindPopup('You are here')
      userLocationLayerRef.current = circle
    }

    return () => {
      tileLayerRef.current?.remove()
      tileLayerRef.current = null
      userLocationLayerRef.current?.remove()
      userLocationLayerRef.current = null
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // When user changes map style (light/dark), swap tile layer
  useEffect(() => {
    if (!mapRef.current || !tileLayerRef.current) return
    tileLayerRef.current.remove()
    tileLayerRef.current = null
    const layer = makeTileLayer(mapStyle).addTo(mapRef.current)
    tileLayerRef.current = layer
  }, [mapStyle])

  // When user location updates (e.g. after tapping "My location"), center map and update pin
  useEffect(() => {
    if (lat == null || lng == null || !mapRef.current) return

    mapRef.current.flyTo([lat, lng], 15, { duration: 0.6 })
    userLocationLayerRef.current?.remove()
    userLocationLayerRef.current = L.circleMarker([lat, lng], {
      radius: 8,
      fillColor: '#3b82f6',
      color: '#fff',
      weight: 2,
      fillOpacity: 1,
    })
      .addTo(mapRef.current)
      .bindPopup('You are here')
  }, [lat, lng])

  // Update station markers whenever stations list changes
  useEffect(() => {
    if (!mapRef.current) return

    markersRef.current.forEach((m) => m.remove())
    markersRef.current = []

    stations.forEach((station: StationWithStatus) => {
      const fs = station.current_status?.fuel_statuses_computed ?? {}
      const worst = worstStatus(fs)
      const color = STATUS_HEX[worst] ?? STATUS_HEX.UNKNOWN
      const icon = makeMarkerIcon(color)

      const marker = L.marker([station.lat, station.lng], { icon })
        .addTo(mapRef.current!)
        .bindPopup(station.name)

      marker.on('click', () => navigate(`/station/${station.id}`))
      markersRef.current.push(marker)
    })
  }, [stations, navigate])

  function handleMyLocation() {
    requestLocation({ highAccuracy: true })
  }

  return (
    <div className="relative h-full w-full">
      <div ref={mapContainerRef} className="h-full w-full" />

      {/* Map style: Light / Dark — user preference, persisted */}
      <div
        className="absolute top-3 right-3 z-[1000] flex rounded-xl bg-white/90 shadow-lg backdrop-blur-sm dark:bg-gray-900/90"
        role="group"
        aria-label="Map style"
      >
        <button
          type="button"
          onClick={() => setMapStyle('light')}
          className={`flex min-h-[40px] min-w-[44px] items-center justify-center rounded-l-xl px-2 transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset ${
            mapStyle === 'light'
              ? 'bg-blue-600 text-white'
              : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
          }`}
          title="Light map"
          aria-label="Light map"
          aria-pressed={mapStyle === 'light'}
        >
          <Sun className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => setMapStyle('dark')}
          className={`flex min-h-[40px] min-w-[44px] items-center justify-center rounded-r-xl px-2 transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset ${
            mapStyle === 'dark'
              ? 'bg-blue-600 text-white'
              : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
          }`}
          title="Dark map"
          aria-label="Dark map"
          aria-pressed={mapStyle === 'dark'}
        >
          <Moon className="h-5 w-5" />
        </button>
      </div>

      {/* My location — below style toggle */}
      <button
        type="button"
        onClick={handleMyLocation}
        disabled={locationLoading}
        className="absolute top-14 right-3 z-[1000] flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-white/90 text-gray-900 shadow-lg backdrop-blur-sm transition hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60 active:scale-95 dark:bg-gray-900/90 dark:text-gray-100 dark:hover:bg-gray-800"
        title="Center on my location"
        aria-label="Center on my location"
      >
        {locationLoading ? (
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : (
          <Crosshair className="h-5 w-5" />
        )}
      </button>

      {/* Legend — readable on both light and dark map */}
      <div className="absolute bottom-10 left-3 z-[1000] rounded-xl bg-white/90 px-3 py-2 text-xs text-gray-800 shadow-lg backdrop-blur-sm dark:bg-gray-900/90 dark:text-gray-200">
        {(['AVAILABLE', 'LIMITED', 'OUT', 'UNKNOWN'] as const).map((s) => (
          <div key={s} className="flex items-center gap-2 py-0.5">
            <span className={`h-3 w-3 rounded-full shrink-0 ${STATUS_DOT_COLORS[s]}`} />
            <span className="capitalize">{s.toLowerCase().replace('_', ' ')}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
