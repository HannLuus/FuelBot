import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import maplibregl from 'maplibre-gl'
import { useLocationStore } from '@/stores/locationStore'
import { useFilterStore } from '@/stores/filterStore'
import { useNearbyStations } from '@/hooks/useNearbyStations'
import { STATUS_DOT_COLORS, worstStatus } from '@/lib/fuelUtils'
import type { StationWithStatus } from '@/types'

// Default to central Yangon when location is unavailable
const YANGON_LAT = 16.8661
const YANGON_LNG = 96.1561

const STATUS_HEX: Record<string, string> = {
  AVAILABLE: '#22c55e',
  LIMITED: '#facc15',
  OUT: '#ef4444',
  UNKNOWN: '#9ca3af',
}

// Inline OSM raster style — no API key needed, always reliable
const OSM_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    },
  },
  layers: [
    {
      id: 'osm-tiles',
      type: 'raster',
      source: 'osm',
    },
  ],
}

export function MapPage() {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markersRef = useRef<maplibregl.Marker[]>([])
  const navigate = useNavigate()
  const { lat, lng } = useLocationStore()
  const { filters } = useFilterStore()

  const effectiveLat = lat ?? YANGON_LAT
  const effectiveLng = lng ?? YANGON_LNG

  const { stations } = useNearbyStations({
    lat: effectiveLat,
    lng: effectiveLng,
    maxDistanceKm: lat !== null ? filters.maxDistanceKm : 25,
    fuelTypes: filters.fuelTypes,
    statusFilter: filters.statusFilter,
  })

  // Initialise map once
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    mapRef.current = new maplibregl.Map({
      container: mapContainerRef.current,
      style: OSM_STYLE,
      center: [effectiveLng, effectiveLat],
      zoom: 13,
      attributionControl: false,
    })

    mapRef.current.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      'bottom-right',
    )
    mapRef.current.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

    // User location pin
    if (lat && lng) {
      new maplibregl.Marker({ color: '#2563eb' }).setLngLat([lng, lat]).addTo(mapRef.current)
    }

    return () => {
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Update station markers whenever stations list changes
  useEffect(() => {
    if (!mapRef.current) return

    markersRef.current.forEach((m) => m.remove())
    markersRef.current = []

    stations.forEach((station: StationWithStatus) => {
      const fs = station.current_status?.fuel_statuses_computed ?? {}
      const worst = worstStatus(fs)
      const color = STATUS_HEX[worst] ?? STATUS_HEX.UNKNOWN

      const el = document.createElement('div')
      el.style.cssText = `
        width:20px; height:20px; border-radius:50%;
        background:${color}; border:2.5px solid white;
        box-shadow:0 1px 4px rgba(0,0,0,0.3); cursor:pointer;
      `
      el.addEventListener('click', () => navigate(`/station/${station.id}`))

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([station.lng, station.lat])
        .addTo(mapRef.current!)

      markersRef.current.push(marker)
    })
  }, [stations, navigate])

  return (
    <div className="relative h-full w-full">
      <div ref={mapContainerRef} className="h-full w-full" />

      {/* Legend */}
      <div className="absolute bottom-10 left-3 rounded-xl bg-white/90 backdrop-blur-sm px-3 py-2 shadow-md text-xs">
        {(['AVAILABLE', 'LIMITED', 'OUT', 'UNKNOWN'] as const).map((s) => (
          <div key={s} className="flex items-center gap-2 py-0.5">
            <span className={`h-3 w-3 rounded-full shrink-0 ${STATUS_DOT_COLORS[s]}`} />
            <span className="text-gray-700 capitalize">{s.toLowerCase().replace('_', ' ')}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
