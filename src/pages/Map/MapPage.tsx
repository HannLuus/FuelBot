import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import L from 'leaflet'
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

  // Initialise Leaflet map once
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    mapRef.current = L.map(mapContainerRef.current, {
      center: [effectiveLat, effectiveLng],
      zoom: 14,
      zoomControl: true,
    })

    // Use CARTO Light — no API key, reliable tiles (OSM main tile server can block localhost/heavy use)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', {
      subdomains: 'abcd',
      maxZoom: 20,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    }).addTo(mapRef.current)

    // User location pin
    if (lat && lng) {
      L.circleMarker([lat, lng], {
        radius: 8,
        fillColor: '#2563eb',
        color: '#fff',
        weight: 2,
        fillOpacity: 1,
      })
        .addTo(mapRef.current)
        .bindPopup('You are here')
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
      const icon = makeMarkerIcon(color)

      const marker = L.marker([station.lat, station.lng], { icon })
        .addTo(mapRef.current!)
        .bindPopup(station.name)

      marker.on('click', () => navigate(`/station/${station.id}`))
      markersRef.current.push(marker)
    })
  }, [stations, navigate])

  return (
    <div className="relative h-full w-full">
      <div ref={mapContainerRef} className="h-full w-full" />

      {/* Legend */}
      <div className="absolute bottom-10 left-3 z-[1000] rounded-xl bg-white/90 backdrop-blur-sm px-3 py-2 shadow-md text-xs">
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
