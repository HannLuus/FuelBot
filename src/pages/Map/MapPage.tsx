import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import L from 'leaflet'
import { Crosshair, Sun, Moon, Lightbulb } from 'lucide-react'
import { useLocationStore } from '@/stores/locationStore'
import { useFilterStore } from '@/stores/filterStore'
import { useMapStyleStore, type MapStyle } from '@/stores/mapStyleStore'
import { useNearbyStations } from '@/hooks/useNearbyStations'
import { STATUS_DOT_COLORS, worstStatusForFuels, isStationVerified } from '@/lib/fuelUtils'
import { WHOLE_COUNTRY_KM } from '@/lib/constants'
import { getBrandInitial, getBrandLogoUrl } from '@/lib/brandLogos'
import { SuggestStationSheet } from '@/components/station/SuggestStationSheet'
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
  UNKNOWN: '#6366f1', // indigo – more visible than gray when status unknown
}

const MARKER_SIZE = 22

function makeMarkerIcon(color: string, unverified = false): L.DivIcon {
  if (unverified) {
    return L.divIcon({
      className: '',
      html: `<div style="
        width:${MARKER_SIZE}px; height:${MARKER_SIZE}px; border-radius:50%;
        background:${color}; border:3px dashed rgba(100,100,100,0.9);
        opacity:0.7; box-shadow:0 1px 4px rgba(0,0,0,0.3);
      " title="Unverified"></div>`,
      iconSize: [MARKER_SIZE, MARKER_SIZE],
      iconAnchor: [MARKER_SIZE / 2, MARKER_SIZE / 2],
    })
  }
  return L.divIcon({
    className: '',
    html: `<div style="
      width:${MARKER_SIZE}px; height:${MARKER_SIZE}px; border-radius:50%;
      background:${color}; border:3px solid white;
      box-shadow:0 2px 6px rgba(0,0,0,0.4);
    " title="Verified"></div>`,
    iconSize: [MARKER_SIZE, MARKER_SIZE],
    iconAnchor: [MARKER_SIZE / 2, MARKER_SIZE / 2],
  })
}

function escapeHtml(s: string): string {
  const div = document.createElement('div')
  div.textContent = s
  return div.innerHTML
}

function getVerificationSourceKey(
  source: string | null | undefined,
): 'verifiedDistributor' | 'verifiedCrowd' | 'verifiedOwner' | 'verified' {
  if (source === 'distributor') return 'verifiedDistributor'
  if (source === 'crowd') return 'verifiedCrowd'
  if (source === 'owner') return 'verifiedOwner'
  return 'verified'
}

function buildStationTooltip(
  station: StationWithStatus,
  t: (key: string) => string,
): string {
  const name = escapeHtml(station.name)
  const brand = station.brand?.trim()
  const logoUrl = brand ? getBrandLogoUrl(brand) : null
  const initial = getBrandInitial(brand)
  const brandLabel = brand ? escapeHtml(brand) : ''
  const brandBlock =
    logoUrl != null
      ? `<img src="${escapeHtml(logoUrl)}" alt="" style="max-height:24px;max-width:24px;object-fit:contain;" onerror="this.onerror=null;this.replaceWith(this.nextElementSibling)"/><span style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:#e5e7eb;color:#374151;font-size:12px;font-weight:600;">${escapeHtml(initial)}</span>`
      : brandLabel
        ? `<span style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:#e5e7eb;color:#374151;font-size:12px;font-weight:600;">${escapeHtml(initial)}</span> <span style="margin-left:4px;">${brandLabel}</span>`
        : ''
  const src = station.verification_source ?? station.verificationSource ?? ''
  const verified = isStationVerified(station)
  const statusLine = verified
    ? `<div style="margin-top:4px;font-size:11px;color:#15803d;font-weight:600;">${escapeHtml(t(`station.${getVerificationSourceKey(typeof src === 'string' ? src : '')}`))}</div>`
    : `<div style="margin-top:4px;font-size:11px;color:#b45309;">${escapeHtml(t('station.stationNotVerified'))}</div>`
  return `<div style="padding:2px 0;min-width:80px;text-align:left;">
    <div style="font-weight:600;font-size:13px;">${name}</div>
    ${brandBlock ? `<div style="display:flex;align-items:center;margin-top:4px;font-size:12px;color:#6b7280;">${brandBlock}</div>` : ''}
    ${statusLine}
  </div>`
}

export function MapPage() {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const markersRef = useRef<L.Marker[]>([])
  const tileLayerRef = useRef<L.TileLayer | null>(null)
  const userLocationLayerRef = useRef<L.CircleMarker | null>(null)
  const navigate = useNavigate()
  const { lat, lng, requestLocation, loading: locationLoading, error: locationError } = useLocationStore()
  const { filters } = useFilterStore()
  const { mapStyle, setMapStyle } = useMapStyleStore()
  const { t, i18n } = useTranslation()
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [suggestLat, setSuggestLat] = useState<number | null>(null)
  const [suggestLng, setSuggestLng] = useState<number | null>(null)
  const suggestionMarkerRef = useRef<L.Marker | null>(null)

  const effectiveLat = lat ?? YANGON_LAT
  const effectiveLng = lng ?? YANGON_LNG

  const { stations } = useNearbyStations({
    lat: effectiveLat,
    lng: effectiveLng,
    maxDistanceKm: lat !== null ? filters.maxDistanceKm : 25,
    selectedRouteId: filters.selectedRouteId,
    fuelTypes: filters.fuelTypes,
    statusFilter: filters.statusFilter,
  })

  const filteredStations = filters.verifiedOnly ? stations.filter(isStationVerified) : stations

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
        fillColor: '#f97316',
        color: '#fff',
        weight: 2,
        fillOpacity: 1,
      })
        .addTo(mapRef.current)
        .bindPopup(i18n.t('map.youAreHere'))
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
      fillColor: '#f97316',
      color: '#fff',
      weight: 2,
      fillOpacity: 1,
    })
      .addTo(mapRef.current)
      .bindPopup(t('map.youAreHere'))
  }, [lat, lng, t])

  // When app language changes, update "You are here" popup text
  useEffect(() => {
    if (userLocationLayerRef.current) {
      userLocationLayerRef.current.setPopupContent(t('map.youAreHere'))
    }
  }, [i18n.language, t])

  // Update station markers whenever stations list changes
  useEffect(() => {
    if (!mapRef.current) return

    markersRef.current.forEach((m) => m.remove())
    markersRef.current = []

    filteredStations.forEach((station: StationWithStatus) => {
      const fs = station.current_status?.fuel_statuses_computed ?? {}
      const worst = worstStatusForFuels(fs, filters.fuelTypes)
      const color = STATUS_HEX[worst] ?? STATUS_HEX.UNKNOWN
      const unverified = !isStationVerified(station)
      const icon = makeMarkerIcon(color, unverified)

      const marker = L.marker([station.lat, station.lng], { icon })
        .addTo(mapRef.current!)
        .bindPopup(station.name)
        .bindTooltip(buildStationTooltip(station, t), {
          direction: 'top',
          permanent: false,
          sticky: true,
          className: 'station-tooltip',
        })

      marker.on('click', () => navigate(`/station/${station.id}`))
      markersRef.current.push(marker)
    })
  }, [filteredStations, navigate, filters.fuelTypes, t])

  // Suggestion pin: show when user has picked a location on the map
  useEffect(() => {
    if (!mapRef.current || suggestLat == null || suggestLng == null) {
      suggestionMarkerRef.current?.remove()
      suggestionMarkerRef.current = null
      return
    }
    suggestionMarkerRef.current?.remove()
    const icon = L.divIcon({
      className: '',
      html: `<div style="
        width:28px; height:28px; border-radius:50%;
        background:#22c55e; border:3px solid white;
        box-shadow:0 2px 8px rgba(0,0,0,0.4);
      " title="Suggested location"></div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    })
    suggestionMarkerRef.current = L.marker([suggestLat, suggestLng], { icon }).addTo(mapRef.current)
    return () => {
      suggestionMarkerRef.current?.remove()
      suggestionMarkerRef.current = null
    }
  }, [suggestLat, suggestLng])

  // When suggestion sheet is open, map clicks set the suggested station location
  useEffect(() => {
    if (!mapRef.current || !suggestOpen) return
    const map = mapRef.current
    function onMapClick(e: L.LeafletMouseEvent) {
      setSuggestLat(e.latlng.lat)
      setSuggestLng(e.latlng.lng)
    }
    map.on('click', onMapClick)
    return () => {
      map.off('click', onMapClick)
    }
  }, [suggestOpen])

  function handleSuggestClose() {
    setSuggestOpen(false)
    setSuggestLat(null)
    setSuggestLng(null)
  }

  // When showing whole country or a route, fit map bounds to all stations (and user location)
  const isNationalView = filters.maxDistanceKm >= WHOLE_COUNTRY_KM
  const isRouteView = !!filters.selectedRouteId
  useEffect(() => {
    if (!mapRef.current || (!isNationalView && !isRouteView) || filteredStations.length === 0) return
    const bounds = L.latLngBounds(
      filteredStations.map((s) => [s.lat, s.lng] as L.LatLngTuple),
    )
    if (lat != null && lng != null) bounds.extend([lat, lng])
    mapRef.current.fitBounds(bounds, { padding: [24, 24], maxZoom: 14 })
  }, [isNationalView, isRouteView, filteredStations, lat, lng])

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
        aria-label={t('map.mapStyle')}
      >
        <button
          type="button"
          onClick={() => setMapStyle('light')}
          className={`flex min-h-[40px] min-w-[44px] items-center justify-center rounded-l-xl px-2 transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset ${
            mapStyle === 'light'
              ? 'bg-blue-600 text-white'
              : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
          }`}
          title={t('map.lightMap')}
          aria-label={t('map.lightMap')}
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
          title={t('map.darkMap')}
          aria-label={t('map.darkMap')}
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
        title={t('map.centerOnMyLocation')}
        aria-label={t('map.centerOnMyLocation')}
      >
        {locationLoading ? (
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : (
          <Crosshair className="h-5 w-5" />
        )}
      </button>

      {/* Location denied / error — when user taps "my location" but permission is off (e.g. on Android) */}
      {locationError && !locationLoading && (
        <div className="absolute top-24 right-3 left-3 z-[1000] rounded-xl bg-orange-50 px-3 py-2.5 text-xs text-orange-800 shadow-lg dark:bg-orange-950/90 dark:text-orange-200">
          <p className="font-medium">{t('home.locationDenied')}</p>
          <button
            type="button"
            onClick={() => requestLocation({ highAccuracy: true })}
            className="mt-1 font-semibold underline underline-offset-2"
          >
            {t('home.tryAgain')}
          </button>
        </div>
      )}

      {/* Legend — follows app language (en / my) */}
      <div className="absolute bottom-10 left-3 z-[1000] rounded-xl bg-white/90 px-3 py-2 text-xs text-gray-800 shadow-lg backdrop-blur-sm dark:bg-gray-900/90 dark:text-gray-200">
        {(['AVAILABLE', 'LIMITED', 'OUT', 'UNKNOWN'] as const).map((s) => (
          <div key={s} className="flex items-center gap-2 py-0.5">
            <span className={`h-3 w-3 rounded-full shrink-0 ${STATUS_DOT_COLORS[s]}`} />
            <span>{t(`fuelStatus.${s}`)}</span>
          </div>
        ))}
      </div>

      {/* Missing-station CTA — bottom-right, above legend */}
      <button
        type="button"
        onClick={() => setSuggestOpen(true)}
        className="absolute bottom-10 right-3 z-[1000] flex items-center gap-1.5 rounded-xl bg-white/90 px-3 py-2 text-xs font-semibold text-amber-700 shadow-lg backdrop-blur-sm hover:bg-amber-50 active:scale-95 dark:bg-gray-900/90 dark:text-amber-300 dark:hover:bg-gray-800"
      >
        <Lightbulb className="h-3.5 w-3.5 shrink-0" />
        {t('suggest.missingStation')}
      </button>

      <SuggestStationSheet
        open={suggestOpen}
        onClose={handleSuggestClose}
        pickedLat={suggestLat}
        pickedLng={suggestLng}
        onClearLocation={() => {
          setSuggestLat(null)
          setSuggestLng(null)
        }}
        hideBackdrop
      />
    </div>
  )
}
