import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import L from 'leaflet'
import { clsx } from 'clsx'
import { Crosshair, Sun, Moon, Lightbulb, MapPin, Clock, CheckCircle, X } from 'lucide-react'
import { useLocationStore } from '@/stores/locationStore'
import { useFilterStore } from '@/stores/filterStore'
import { useMapStyleStore, type MapStyle } from '@/stores/mapStyleStore'
import { useNearbyStations } from '@/hooks/useNearbyStations'
import {
  STATUS_DOT_COLORS,
  worstStatusForFuels,
  isStationVerified,
  FUEL_CODES,
  FUEL_DISPLAY,
  formatDistance,
  formatRelativeTime,
  QUEUE_LABEL,
  REPORTER_ROLE_LABEL,
} from '@/lib/fuelUtils'
import { WHOLE_COUNTRY_KM } from '@/lib/constants'
import { getBrandInitial, getBrandLogoUrl } from '@/lib/brandLogos'
import { SuggestStationSheet } from '@/components/station/SuggestStationSheet'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { FuelChip } from '@/components/ui/FuelChip'
import type { FuelCode, StationWithStatus } from '@/types'

const CARTO_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

function makeCartoTileLayer(style: MapStyle): L.TileLayer {
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

function makeOsmFallbackTileLayer(): L.TileLayer {
  return L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    subdomains: 'abc',
    maxZoom: 20,
    attribution: OSM_ATTRIBUTION,
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

function makeMarkerIcon(color: string, unverified = false, selected = false): L.DivIcon {
  const size = selected ? MARKER_SIZE + 6 : MARKER_SIZE
  const ring = selected ? '0 0 0 3px #2563eb' : 'none'
  if (unverified) {
    return L.divIcon({
      className: '',
      html: `<div style="
        width:${size}px; height:${size}px; border-radius:50%;
        background:${color}; border:3px dashed rgba(100,100,100,0.9);
        opacity:0.7; box-shadow:0 1px 4px rgba(0,0,0,0.3), ${ring};
      " title="Unverified"></div>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    })
  }
  return L.divIcon({
    className: '',
    html: `<div style="
      width:${size}px; height:${size}px; border-radius:50%;
      background:${color}; border:3px solid white;
      box-shadow:0 2px 6px rgba(0,0,0,0.4), ${ring};
    " title="Verified"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
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
  const tileFallbackActiveRef = useRef(false)
  const userLocationLayerRef = useRef<L.CircleMarker | null>(null)
  const navigate = useNavigate()
  const { lat, lng, requestLocation, loading: locationLoading, error: locationError } = useLocationStore()
  const { filters, setFuelTypes } = useFilterStore()
  const { mapStyle, setMapStyle } = useMapStyleStore()
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'en' | 'my'
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [suggestLat, setSuggestLat] = useState<number | null>(null)
  const [suggestLng, setSuggestLng] = useState<number | null>(null)
  const suggestionMarkerRef = useRef<L.Marker | null>(null)
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null)

  const effectiveLat = lat ?? YANGON_LAT
  const effectiveLng = lng ?? YANGON_LNG
  const effectiveRadius =
    filters.maxDistanceKm >= WHOLE_COUNTRY_KM
      ? filters.maxDistanceKm
      : lat !== null
        ? filters.maxDistanceKm
        : 25

  const { stations } = useNearbyStations({
    lat: effectiveLat,
    lng: effectiveLng,
    maxDistanceKm: effectiveRadius,
    selectedRouteId: filters.selectedRouteId,
    fuelTypes: filters.fuelTypes,
    statusFilter: filters.statusFilter,
  })

  const filteredStations = filters.verifiedOnly ? stations.filter(isStationVerified) : stations

  const selectedStation =
    selectedStationId == null
      ? null
      : (filteredStations.find((s) => s.id === selectedStationId) ?? null)

  function selectMapFuel(code: FuelCode) {
    if (filters.fuelTypes.length === 1 && filters.fuelTypes[0] === code) {
      setFuelTypes([])
    } else {
      setFuelTypes([code])
    }
  }

  function activateTileFallback() {
    if (!mapRef.current || tileFallbackActiveRef.current) return
    tileFallbackActiveRef.current = true
    tileLayerRef.current?.remove()
    tileLayerRef.current = makeOsmFallbackTileLayer().addTo(mapRef.current)
  }

  function addCartoLayerWithFallback(style: MapStyle) {
    if (!mapRef.current) return
    const layer = makeCartoTileLayer(style)
    layer.on('tileerror', () => {
      // Some mobile networks/adblockers/CSP combinations block Carto hosts.
      // Fall back to OSM so the map never stays blank.
      activateTileFallback()
    })
    tileLayerRef.current = layer.addTo(mapRef.current)
  }

  // Initialise Leaflet map once
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    const map = L.map(mapContainerRef.current, {
      center: [effectiveLat, effectiveLng],
      zoom: 14,
      zoomControl: true,
    })
    mapRef.current = map

    const onMapBackgroundClick = () => setSelectedStationId(null)
    map.on('click', onMapBackgroundClick)

    const initialStyle = useMapStyleStore.getState().mapStyle
    addCartoLayerWithFallback(initialStyle)

    if (lat != null && lng != null) {
      const circle = L.circleMarker([lat, lng], {
        radius: 8,
        fillColor: '#f97316',
        color: '#fff',
        weight: 2,
        fillOpacity: 1,
      })
        .addTo(map)
        .bindPopup(i18n.t('map.youAreHere'))
      userLocationLayerRef.current = circle
    }

    return () => {
      map.off('click', onMapBackgroundClick)
      tileLayerRef.current?.remove()
      tileLayerRef.current = null
      tileFallbackActiveRef.current = false
      userLocationLayerRef.current?.remove()
      userLocationLayerRef.current = null
      map.remove()
      mapRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // When user changes map style (light/dark), swap tile layer
  useEffect(() => {
    if (!mapRef.current || !tileLayerRef.current) return
    tileLayerRef.current.remove()
    tileLayerRef.current = null
    if (tileFallbackActiveRef.current) {
      tileLayerRef.current = makeOsmFallbackTileLayer().addTo(mapRef.current)
      return
    }
    addCartoLayerWithFallback(mapStyle)
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
      const isSelected = selectedStationId === station.id
      const icon = makeMarkerIcon(color, unverified, isSelected)

      const marker = L.marker([station.lat, station.lng], { icon })
        .addTo(mapRef.current!)
        .bindTooltip(buildStationTooltip(station, t), {
          direction: 'top',
          permanent: false,
          sticky: true,
          className: 'station-tooltip',
        })

      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e)
        setSelectedStationId(station.id)
        mapRef.current?.panTo([station.lat, station.lng], { animate: true, duration: 0.35 })
      })
      markersRef.current.push(marker)
    })
  }, [filteredStations, filters.fuelTypes, t, selectedStationId])

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

  const previewStatus = selectedStation?.current_status
  const previewFs = previewStatus?.fuel_statuses_computed ?? {}
  const focusFuelCode = filters.fuelTypes.length === 1 ? filters.fuelTypes[0] : null
  const previewFuelChips =
    focusFuelCode != null
      ? [{ code: focusFuelCode, fuelStatus: previewFs[focusFuelCode] ?? 'UNKNOWN' }]
      : FUEL_CODES.map((code) => ({
          code,
          fuelStatus: previewFs[code] ?? 'UNKNOWN',
        })).filter((e) => e.fuelStatus !== 'UNKNOWN')

  return (
    <div className="relative h-full w-full">
      <div ref={mapContainerRef} className="h-full w-full" />

      {/* Map tools — single top-right group: theme + my location */}
      <div
        className="absolute top-3 right-3 z-[1000] flex items-stretch overflow-hidden rounded-xl bg-white/90 shadow-lg backdrop-blur-sm dark:bg-gray-900/90"
        role="group"
        aria-label={`${t('map.mapStyle')}; ${t('map.centerOnMyLocation')}`}
      >
        <button
          type="button"
          onClick={() => setMapStyle('light')}
          className={`flex min-h-[44px] min-w-[44px] items-center justify-center px-2 transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset ${
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
          className={`flex min-h-[44px] min-w-[44px] items-center justify-center px-2 transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset ${
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
        <div
          className="my-2 w-px shrink-0 self-stretch bg-gray-200 dark:bg-gray-600"
          aria-hidden
        />
        <button
          type="button"
          onClick={handleMyLocation}
          disabled={locationLoading}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center px-2 text-gray-900 transition hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset disabled:opacity-60 active:scale-95 dark:text-gray-100 dark:hover:bg-gray-800"
          title={t('map.centerOnMyLocation')}
          aria-label={t('map.centerOnMyLocation')}
        >
          {locationLoading ? (
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <Crosshair className="h-5 w-5" />
          )}
        </button>
      </div>

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

      {/* Bottom bar: fuel filter + compact legend + suggest — one panel */}
      <div
        className={clsx(
          'absolute z-[1000] max-w-[calc(100%-1rem)] rounded-2xl border border-gray-100 bg-white/95 px-2.5 py-2 shadow-lg backdrop-blur-sm dark:border-gray-700 dark:bg-gray-900/95',
          'left-1/2 -translate-x-1/2 sm:left-3 sm:translate-x-0 sm:max-w-none',
          'w-[calc(100%-1rem)] sm:w-auto sm:min-w-0 sm:max-w-[min(36rem,calc(100%-1.5rem))]',
          // Keep bar above the preview card (max-h ~42vh, anchored bottom-3)
          selectedStation ? 'bottom-[calc(42vh+1.25rem)]' : 'bottom-2.5 sm:bottom-3',
        )}
      >
        <p className="mb-1.5 text-center text-[10px] font-medium leading-snug text-gray-700 sm:text-left sm:text-[11px] dark:text-gray-300">
          {t('map.fuelFilterHint')}
        </p>
        <div className="flex flex-wrap justify-center gap-1.5 sm:justify-start">
          {FUEL_CODES.map((code) => {
            const active = filters.fuelTypes.length === 1 && filters.fuelTypes[0] === code
            return (
              <button
                key={code}
                type="button"
                onClick={() => selectMapFuel(code)}
                className={clsx(
                  'min-h-[36px] rounded-full px-2.5 py-1 text-xs font-semibold transition-colors sm:min-h-0 sm:px-3 sm:py-1.5 sm:text-sm',
                  active
                    ? 'bg-blue-600 text-white active:bg-blue-700'
                    : 'bg-gray-100 text-gray-700 active:bg-gray-200 dark:bg-gray-800 dark:text-gray-200',
                )}
              >
                {FUEL_DISPLAY[code][lang]}
              </button>
            )
          })}
        </div>
        <div className="mt-2 flex flex-col gap-2 border-t border-gray-100 pt-2 dark:border-gray-700 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] text-gray-700 sm:justify-start sm:text-xs dark:text-gray-300">
            {(['AVAILABLE', 'LIMITED', 'OUT', 'UNKNOWN'] as const).map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-full shrink-0 sm:h-3 sm:w-3 ${STATUS_DOT_COLORS[s]}`} />
                <span>{t(`fuelStatus.${s}`)}</span>
              </span>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setSuggestOpen(true)}
            className="flex shrink-0 items-center justify-center gap-1.5 rounded-lg py-1.5 text-center text-[11px] font-semibold text-amber-700 transition hover:bg-amber-50 active:bg-amber-100 sm:justify-end sm:py-0 sm:text-xs dark:text-amber-300 dark:hover:bg-gray-800"
          >
            <Lightbulb className="h-3.5 w-3.5 shrink-0" />
            {t('suggest.missingStation')}
          </button>
        </div>
      </div>

      {/* Station preview — tap marker; same signals as Nearby cards */}
      {selectedStation && (
        <div className="absolute bottom-3 left-3 right-3 z-[1001] max-h-[42vh] overflow-y-auto rounded-2xl border border-gray-200 bg-white p-4 text-left shadow-xl dark:border-gray-700 dark:bg-gray-900">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-base font-bold text-gray-900 dark:text-gray-100">{selectedStation.name}</span>
                {selectedStation.is_verified ? (
                  <Badge variant="verified">
                    <CheckCircle className="mr-0.5 h-3 w-3" />
                    {t('station.verifiedOwnerClaimed')}
                  </Badge>
                ) : selectedStation.verification_source === 'distributor' ? (
                  <Badge variant="verified">
                    <CheckCircle className="mr-0.5 h-3 w-3" />
                    {t('station.verifiedDistributor')}
                  </Badge>
                ) : selectedStation.verification_source === 'crowd' ? (
                  <Badge variant="verified">
                    <CheckCircle className="mr-0.5 h-3 w-3" />
                    {t('station.verifiedCrowd')}
                  </Badge>
                ) : null}
                {previewStatus &&
                  (previewStatus.is_stale ?? true) &&
                  previewStatus.last_updated_at && (
                    <Badge variant="stale">{t('station.stale')}</Badge>
                  )}
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{selectedStation.township}</span>
                {selectedStation.distance_m !== undefined && (
                  <>
                    <span className="text-gray-700">·</span>
                    <span className="font-medium text-gray-700 dark:text-gray-300">
                      {formatDistance(selectedStation.distance_m)}
                    </span>
                  </>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedStationId(null)}
              className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-gray-700 hover:bg-gray-100 active:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-800"
              aria-label={t('map.closePreview')}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {previewFuelChips.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {previewFuelChips.map(({ code, fuelStatus }) => (
                <FuelChip
                  key={code}
                  code={code}
                  status={fuelStatus}
                  size={focusFuelCode ? 'md' : 'sm'}
                />
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-gray-700 dark:text-gray-300">{t('station.noData')}</p>
          )}

          {previewStatus && (
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-700 dark:text-gray-300">
              <div className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                <span>
                  {!previewStatus.last_updated_at
                    ? t('station.noData')
                    : t('station.lastUpdated', {
                        time: formatRelativeTime(previewStatus.last_updated_at),
                      })}
                </span>
              </div>
              {previewStatus.source_role && (
                <span>{REPORTER_ROLE_LABEL[previewStatus.source_role][lang]}</span>
              )}
              {previewStatus.queue_bucket_computed && previewStatus.queue_bucket_computed !== 'NONE' && (
                <span className="font-medium">{QUEUE_LABEL[previewStatus.queue_bucket_computed][lang]}</span>
              )}
            </div>
          )}

          <Button
            variant="primary"
            size="md"
            className="mt-4 w-full"
            onClick={() => navigate(`/station/${selectedStation.id}`)}
          >
            {t('map.viewStationDetails')}
          </Button>
        </div>
      )}

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
