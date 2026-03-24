import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, MapPin, Search, Lightbulb, Crosshair } from 'lucide-react'
import L from 'leaflet'
import { useLocationStore } from '@/stores/locationStore'
import { useNearbyStations } from '@/hooks/useNearbyStations'
import { SuggestStationSheet } from '@/components/station/SuggestStationSheet'
import { Spinner } from '@/components/ui/Spinner'
import { Button } from '@/components/ui/Button'
import { formatDistance } from '@/lib/fuelUtils'

const YANGON_LAT = 16.8661
const YANGON_LNG = 96.1561
const REPORT_PICKER_RADIUS_KM = 1
const REPORT_PICKER_MAX_STATIONS = 4
const EMPTY_FUEL_TYPES: [] = []
const CARTO_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

function track(event: string, payload?: Record<string, unknown>) {
  console.info(`[analytics] ${event}`, payload ?? {})
}

export function ReportStationPickerPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { lat, lng, loading: locLoading, requestLocation } = useLocationStore()
  const [search, setSearch] = useState('')
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [pickedLat, setPickedLat] = useState(lat ?? YANGON_LAT)
  const [pickedLng, setPickedLng] = useState(lng ?? YANGON_LNG)
  const [hasManualPick, setHasManualPick] = useState(false)
  const [gpsCentering, setGpsCentering] = useState(false)
  const [gpsCenterError, setGpsCenterError] = useState<string | null>(null)
  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const tileLayerRef = useRef<L.TileLayer | null>(null)
  const tileFallbackActiveRef = useRef(false)
  const pickedMarkerRef = useRef<L.CircleMarker | null>(null)
  const gpsMarkerRef = useRef<L.CircleMarker | null>(null)

  function activateTileFallback() {
    if (!mapRef.current || tileFallbackActiveRef.current) return
    tileFallbackActiveRef.current = true
    tileLayerRef.current?.remove()
    tileLayerRef.current = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      subdomains: 'abc',
      maxZoom: 20,
      attribution: OSM_ATTRIBUTION,
    }).addTo(mapRef.current)
  }

  function focusMapAt(nextLat: number, nextLng: number, zoom = 16) {
    const map = mapRef.current
    if (!map) return
    // On some mobile layouts the map camera won't move unless we re-measure first.
    map.invalidateSize()
    map.setView([nextLat, nextLng], zoom, { animate: false })
    window.requestAnimationFrame(() => {
      map.invalidateSize()
      map.flyTo([nextLat, nextLng], zoom, { duration: 0.5 })
    })
  }

  useEffect(() => {
    track('report_picker_opened')
    if (lat == null || lng == null) requestLocation({ highAccuracy: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (hasManualPick) return
    if (lat == null || lng == null) return
    setPickedLat(lat)
    setPickedLng(lng)
  }, [lat, lng, hasManualPick])

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return

    const map = L.map(mapContainerRef.current, {
      center: [pickedLat, pickedLng],
      zoom: 14,
      zoomControl: true,
    })
    mapRef.current = map
    window.setTimeout(() => map.invalidateSize(), 0)

    const tile = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', {
      subdomains: 'abcd',
      maxZoom: 20,
      attribution: CARTO_ATTRIBUTION,
    })
    tile.on('tileerror', () => {
      activateTileFallback()
    })
    tileLayerRef.current = tile.addTo(map)

    pickedMarkerRef.current = L.circleMarker([pickedLat, pickedLng], {
      radius: 9,
      fillColor: '#2563eb',
      color: '#fff',
      weight: 2,
      fillOpacity: 1,
    }).addTo(map)

    map.on('click', (e: L.LeafletMouseEvent) => {
      setHasManualPick(true)
      setPickedLat(e.latlng.lat)
      setPickedLng(e.latlng.lng)
      track('report_picker_map_point_selected', { lat: e.latlng.lat, lng: e.latlng.lng })
    })

    return () => {
      tileLayerRef.current?.remove()
      tileLayerRef.current = null
      tileFallbackActiveRef.current = false
      gpsMarkerRef.current?.remove()
      pickedMarkerRef.current?.remove()
      map.remove()
      mapRef.current = null
      gpsMarkerRef.current = null
      pickedMarkerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!mapRef.current) return
    if (!pickedMarkerRef.current) return
    pickedMarkerRef.current.setLatLng([pickedLat, pickedLng])
    focusMapAt(pickedLat, pickedLng, 15)
  }, [pickedLat, pickedLng])

  useEffect(() => {
    if (!mapRef.current) return
    if (lat == null || lng == null) return
    if (!gpsMarkerRef.current) {
      gpsMarkerRef.current = L.circleMarker([lat, lng], {
        radius: 7,
        fillColor: '#f97316',
        color: '#fff',
        weight: 2,
        fillOpacity: 1,
      }).addTo(mapRef.current)
      return
    }
    gpsMarkerRef.current.setLatLng([lat, lng])
  }, [lat, lng])

  const { stations, loading, error, refresh } = useNearbyStations({
    lat: pickedLat,
    lng: pickedLng,
    maxDistanceKm: REPORT_PICKER_RADIUS_KM,
    selectedRouteId: null,
    fuelTypes: EMPTY_FUEL_TYPES,
    statusFilter: 'ALL',
  })

  const filteredStations = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const pool = needle
      ? stations.filter((s) => {
          return (
            s.name.toLowerCase().includes(needle) ||
            s.township.toLowerCase().includes(needle) ||
            s.city.toLowerCase().includes(needle)
          )
        })
      : stations
    return pool.slice(0, REPORT_PICKER_MAX_STATIONS)
  }, [search, stations])

  const showTruncatedHint = stations.length > REPORT_PICKER_MAX_STATIONS && search.trim().length === 0

  function centerMapOnCurrentGps() {
    if (!navigator.geolocation) {
      setGpsCenterError(t('station.reportWrongLocationGeolocationUnsupported'))
      return
    }
    setGpsCentering(true)
    setGpsCenterError(null)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLat = position.coords.latitude
        const nextLng = position.coords.longitude
        setHasManualPick(true)
        setPickedLat(nextLat)
        setPickedLng(nextLng)
        focusMapAt(nextLat, nextLng, 16)
        setGpsCentering(false)
        track('report_picker_centered_on_current_gps')
      },
      (err) => {
        setGpsCentering(false)
        if (err.code === err.PERMISSION_DENIED) setGpsCenterError(t('station.reportWrongLocationGeolocationDenied'))
        else setGpsCenterError(t('station.reportWrongLocationGeolocationError'))
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    )
  }

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex items-center gap-3 border-b border-gray-100 px-2 py-1">
        <button
          onClick={() => navigate(-1)}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl active:bg-gray-100"
          aria-label={t('common.close')}
        >
          <ArrowLeft className="h-5 w-5 text-gray-700" />
        </button>
        <h1 className="text-base font-bold text-gray-900">{t('report.selectStationTitle')}</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <p className="mb-3 text-sm text-gray-700">{t('report.selectStationIntro')}</p>

        <div className="mb-4 rounded-2xl border border-gray-200 bg-white p-3">
          <p className="mb-1 text-xs font-semibold text-gray-800">{t('report.mapPickerTitle')}</p>
          <p className="mb-2 text-xs text-gray-700">{t('report.mapPickerHint')}</p>
          <div className="relative">
            <div
              ref={(el) => {
                mapContainerRef.current = el
              }}
              className="h-56 w-full rounded-xl border border-gray-200"
            />
            <button
              type="button"
              onClick={centerMapOnCurrentGps}
              disabled={gpsCentering}
              className="absolute right-2 top-2 z-[900] flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg bg-white/95 text-gray-900 shadow-md active:scale-95 disabled:opacity-60"
              title={t('map.centerOnMyLocation')}
              aria-label={t('map.centerOnMyLocation')}
            >
              {gpsCentering ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <Crosshair className="h-4 w-4" />
              )}
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-700">
            {t('report.pickedLocation')}: {pickedLat.toFixed(5)}, {pickedLng.toFixed(5)}
          </p>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="mt-2"
            disabled={locLoading || lat == null || lng == null}
            onClick={() => {
              centerMapOnCurrentGps()
            }}
          >
            <MapPin className="h-4 w-4" />
            {t('report.useGpsOnMap')}
          </Button>
          {gpsCenterError && (
            <p className="mt-2 text-xs text-amber-800">{gpsCenterError}</p>
          )}
        </div>

        {(lat == null || lng == null) && (
          <div className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {t('report.locationOptionalSearchHint')}
          </div>
        )}

        <div className="mb-4 rounded-xl border border-gray-300 bg-white px-3 py-2">
          <label className="sr-only" htmlFor="report-station-search">{t('report.stationSearchPlaceholder')}</label>
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-gray-700" />
            <input
              id="report-station-search"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('report.stationSearchPlaceholder')}
              className="w-full bg-transparent text-sm text-gray-900 placeholder-gray-600 outline-none"
            />
          </div>
        </div>

        <div className="mb-4 flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={locLoading}
            onClick={() => requestLocation({ highAccuracy: true })}
          >
            <MapPin className="h-4 w-4" />
            {t('report.refreshNearby')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={refresh}
          >
            {t('home.tryAgain')}
          </Button>
        </div>

        {showTruncatedHint && (
          <p className="mb-2 text-xs text-gray-700">{t('report.nearestStationsOnly')}</p>
        )}

        {loading && stations.length === 0 ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : error ? (
          <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{t('errors.network')}</div>
        ) : filteredStations.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <p className="text-sm font-semibold text-gray-900">{t('report.noStationsFound')}</p>
            <p className="mt-1 text-xs text-gray-700">{t('report.noStationsFoundHint')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {loading && (
              <p className="text-xs text-gray-600">{t('report.refreshingStations')}</p>
            )}
            {filteredStations.map((station) => (
              <button
                key={station.id}
                type="button"
                onClick={() => {
                  track('report_station_selected', { station_id: station.id })
                  navigate(`/report/${station.id}`)
                }}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-left active:bg-gray-50"
              >
                <p className="text-sm font-semibold text-gray-900">{station.name}</p>
                <p className="mt-1 text-xs text-gray-700">
                  {station.township}, {station.city}
                  {station.distance_m != null ? ` · ${formatDistance(station.distance_m)}` : ''}
                </p>
              </button>
            ))}
          </div>
        )}

        <div className="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-4">
          <div className="flex items-start gap-2">
            <Lightbulb className="mt-0.5 h-4 w-4 text-blue-600" />
            <div>
              <p className="text-sm font-semibold text-blue-900">{t('report.cantFindStationTitle')}</p>
              <p className="mt-1 text-xs text-blue-900">{t('report.cantFindStationBody')}</p>
              <p className="mt-1 text-xs text-blue-900">{t('report.cantFindStationRewardsHint')}</p>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="mt-3"
            onClick={() => {
              track('report_station_not_found_cta_clicked')
              setSuggestOpen(true)
            }}
          >
            {t('report.suggestStationCta')}
          </Button>
        </div>
      </div>

      <SuggestStationSheet open={suggestOpen} onClose={() => setSuggestOpen(false)} />
    </div>
  )
}

