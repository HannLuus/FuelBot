import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import L from 'leaflet'
import { Store, CheckCircle, Send, Users, MapPin, Upload, Crosshair, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getDeviceHash } from '@/lib/deviceHash'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { FUEL_CODES, FUEL_DISPLAY, STATUS_LABEL, QUEUE_LABEL, formatRelativeTime } from '@/lib/fuelUtils'
import type { Station, FuelCode, FuelStatus, QueueBucket, FuelStatuses, StationCurrentStatus, SubscriptionTierRequested } from '@/types'
import { formatMmk } from '@/lib/subscriptionTiers'
import { usePaymentConfig } from '@/hooks/usePaymentConfig'
import { useB2BPricing, type B2BDurationMonths, quoteB2BPrice } from '@/hooks/useB2BPricing'
import { YANGON_LAT, YANGON_LNG, makeCartoTileLayer } from '@/lib/map'

const PAYMENT_SCREENSHOT_BUCKET = 'b2b-payment-screenshots'
const DURATION_OPTIONS: B2BDurationMonths[] = [3, 6, 12]

type FuelStatusOrSkip = FuelStatus | 'SKIP'
type SaveState = 'idle' | 'saving' | 'success' | 'error'
interface ReliabilityRow {
  reports_last_7d: number
  reports_last_30d: number
  verified_last_7d: number
  verified_last_30d: number
  last_updated_at: string | null
  city_name: string | null
  city_stations_count: number | null
  city_avg_reports_7d: number | null
  city_avg_reports_30d: number | null
}
interface UptimeRow {
  has_sufficient_data: boolean
  samples_count: number
  expected_samples: number
  uptime_pct: number | null
}

function makePickerTileLayer(): L.TileLayer {
  return makeCartoTileLayer('light')
}

/** Draggable marker icon for the registration map picker (avoids relying on Leaflet default icon assets which can break in Vite). */
function makePickerMarkerIcon(): L.DivIcon {
  return L.divIcon({
    className: 'location-picker-marker',
    html: '<div style="width:32px;height:32px;margin-left:-16px;margin-top:-32px;background:#2563eb;border:3px solid #fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 8px rgba(0,0,0,0.3);"></div>',
    iconSize: [32, 32],
    iconAnchor: [16, 32],
  })
}

export function StationOwnerPage() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'en' | 'my'
  const { user, session } = useAuthStore()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [myStation, setMyStation] = useState<Station | null>(null)
  const [currentStatus, setCurrentStatus] = useState<StationCurrentStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [posting, setPosting] = useState(false)
  const [postResult, setPostResult] = useState<'success' | 'error' | 'needFuel' | null>(null)
  const [registering, setRegistering] = useState(false)
  const [registerResult, setRegisterResult] = useState<'success' | 'error' | null>(null)
  const [registerErrorMessage, setRegisterErrorMessage] = useState<string | null>(null)
  const [registerForm, setRegisterForm] = useState({
    name: '',
    brand: '',
    address: '',
    township: '',
    city: 'Yangon',
    lat: null as number | null,
    lng: null as number | null,
  })
  const [showMapPicker, setShowMapPicker] = useState(false)
  const [registerLocationLoading, setRegisterLocationLoading] = useState(false)
  const [registerLocationError, setRegisterLocationError] = useState<string | null>(null)
  const mapPickerContainerRef = useRef<HTMLDivElement>(null)
  const mapPickerMapRef = useRef<L.Map | null>(null)
  const mapPickerMarkerRef = useRef<L.Marker | null>(null)
  const mapPickerCloseButtonRef = useRef<HTMLButtonElement>(null)
  const pickOnMapButtonRef = useRef<HTMLButtonElement>(null)
  const [fuelStatuses, setFuelStatuses] = useState<Record<FuelCode, FuelStatusOrSkip>>({
    RON92: 'SKIP',
    RON95: 'SKIP',
    DIESEL: 'SKIP',
    PREMIUM_DIESEL: 'SKIP',
  })
  const [queue] = useState<QueueBucket>('NONE')
  const [tier, setTier] = useState<SubscriptionTierRequested>('small')
  const [durationMonths, setDurationMonths] = useState<B2BDurationMonths>(3)
  const [referralCodeInput, setReferralCodeInput] = useState('')
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [stationPhotos, setStationPhotos] = useState<string[]>([])
  const [locationPhoto, setLocationPhoto] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [submittingPaid, setSubmittingPaid] = useState(false)
  const [recognitionPhotoUrl, setRecognitionPhotoUrl] = useState<string | null>(null)
  const [recognitionConfirming, setRecognitionConfirming] = useState(false)
  const [reliability, setReliability] = useState<ReliabilityRow | null>(null)
  const [uptime, setUptime] = useState<UptimeRow | null>(null)
  const [editableStationName, setEditableStationName] = useState('')
  const [editableStationBrand, setEditableStationBrand] = useState('')
  const [setLocationLoading, setSetLocationLoading] = useState(false)
  const [setLocationMessage, setSetLocationMessage] = useState<string | null>(null)
  const [ownerPaymentReference, setOwnerPaymentReference] = useState('')
  const [ownerScreenshotPath, setOwnerScreenshotPath] = useState<string | null>(null)
  const [uploadingPaymentScreenshot, setUploadingPaymentScreenshot] = useState(false)
  const paymentScreenshotInputRef = useRef<HTMLInputElement>(null)
  const [showOwnerLocationPicker, setShowOwnerLocationPicker] = useState(false)
  const [ownerLocationDraft, setOwnerLocationDraft] = useState<{ lat: number, lng: number } | null>(null)
  const [ownerLocationPickerError, setOwnerLocationPickerError] = useState<string | null>(null)
  const ownerLocationMapRef = useRef<L.Map | null>(null)
  const ownerLocationMarkerRef = useRef<L.Marker | null>(null)
  const ownerLocationContainerRef = useRef<HTMLDivElement>(null)

  const { config: pricingConfig, loading: pricingLoading } = useB2BPricing()
  const selectedDurationQuote = useMemo(
    () => quoteB2BPrice(pricingConfig, durationMonths),
    [pricingConfig, durationMonths],
  )
  const {
    config: paymentConfig,
    loading: paymentConfigLoading,
    error: paymentConfigError,
  } = usePaymentConfig()
  const paymentInstructions = paymentConfig.payment_instructions
  const paymentQrUrl = paymentConfig.payment_qr_url
  const paymentPhoneKpay = paymentConfig.payment_phone_kpay || ''
  const authRedirectPath = `/auth?mode=signup&redirect=${encodeURIComponent(`/station${window.location.search}`)}`
  const ownerPortalState = useMemo(() => {
    if (!myStation) return 'registration'
    if (myStation.is_verified) return 'verified'
    if (myStation.payment_received_at) return 'payment_confirmed'
    if (myStation.payment_reported_at) return 'payment_submitted'
    return 'draft'
  }, [myStation])
  const showPlanSelection = !myStation || ownerPortalState === 'draft'

  useEffect(() => {
    if (!user) return
    void loadMyStation()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- loadMyStation should rerun only when authenticated user identity changes
  }, [user?.id])

  // Lock body scroll when map picker overlay is open (prevents background scroll on mobile)
  useEffect(() => {
    if (!showMapPicker && !showOwnerLocationPicker) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [showMapPicker, showOwnerLocationPicker])

  // Focus close button when map picker opens; Escape key closes picker
  useEffect(() => {
    if (!showMapPicker && !showOwnerLocationPicker) return
    mapPickerCloseButtonRef.current?.focus()
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        setShowMapPicker(false)
        setShowOwnerLocationPicker(false)
        setRegisterLocationError(null)
        setTimeout(() => pickOnMapButtonRef.current?.focus(), 0)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showMapPicker, showOwnerLocationPicker])

  // Map picker overlay: init Leaflet when open, cleanup when closed. Intentionally depend only on showMapPicker; initial center uses registerForm at open time.
  useEffect(() => {
    if (!showMapPicker) return
    const container = mapPickerContainerRef.current
    if (!container || mapPickerMapRef.current) return

    const initLat = registerForm.lat ?? YANGON_LAT
    const initLng = registerForm.lng ?? YANGON_LNG

    const map = L.map(container, {
      center: [initLat, initLng],
      zoom: 15,
      zoomControl: true,
    })
    makePickerTileLayer().addTo(map)

    const marker = L.marker([initLat, initLng], {
      draggable: true,
      icon: makePickerMarkerIcon(),
    }).addTo(map)
    mapPickerMapRef.current = map
    mapPickerMarkerRef.current = marker
    map.invalidateSize()
    // Re-run after layout so Leaflet gets correct container size (flex layout may not be computed yet)
    const raf = requestAnimationFrame(() => {
      if (mapPickerMapRef.current === map) map.invalidateSize()
    })

    return () => {
      cancelAnimationFrame(raf)
      marker.remove()
      map.remove()
      mapPickerMapRef.current = null
      mapPickerMarkerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init once when picker opens; initial center uses registerForm at open time only
  }, [showMapPicker])

  useEffect(() => {
    if (!showOwnerLocationPicker) return
    const container = ownerLocationContainerRef.current
    if (!container || ownerLocationMapRef.current || !myStation) return

    const initLat = ownerLocationDraft?.lat ?? myStation.lat
    const initLng = ownerLocationDraft?.lng ?? myStation.lng
    const map = L.map(container, {
      center: [initLat, initLng],
      zoom: 16,
      zoomControl: true,
    })
    makePickerTileLayer().addTo(map)

    const marker = L.marker([initLat, initLng], {
      draggable: true,
      icon: makePickerMarkerIcon(),
    }).addTo(map)
    const currentMarker = L.circleMarker([myStation.lat, myStation.lng], {
      radius: 8,
      fillColor: '#10b981',
      color: '#ffffff',
      weight: 2,
      fillOpacity: 1,
    }).addTo(map)
    marker.on('dragend', () => {
      const latLng = marker.getLatLng()
      setOwnerLocationDraft({ lat: latLng.lat, lng: latLng.lng })
    })

    ownerLocationMapRef.current = map
    ownerLocationMarkerRef.current = marker
    map.invalidateSize()

    const raf = requestAnimationFrame(() => {
      if (ownerLocationMapRef.current === map) map.invalidateSize()
    })

    return () => {
      cancelAnimationFrame(raf)
      currentMarker.remove()
      marker.remove()
      map.remove()
      ownerLocationMapRef.current = null
      ownerLocationMarkerRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- initialize once per open; marker interactions manage draft updates
  }, [myStation, showOwnerLocationPicker])

  async function loadReliability() {
    if (!myStation?.id) return
    const { data, error } = await supabase.rpc('get_station_reliability', { p_station_id: myStation.id })
    if (error) {
      setReliability(null)
      return
    }
    const row = Array.isArray(data) ? data[0] : data
    setReliability(row ?? null)
  }

  useEffect(() => {
    if (!myStation?.id) {
      setReliability(null)
      return
    }
    void loadReliability()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch reliability only when station identity changes
  }, [myStation?.id])

  async function loadUptime() {
    if (!myStation?.id) return
    const { data, error } = await supabase.rpc('get_station_uptime', {
      p_station_id: myStation.id,
      p_days: 30,
    })
    if (error) {
      setUptime(null)
      return
    }
    const row = Array.isArray(data) ? data[0] : data
    setUptime(row ?? null)
  }

  useEffect(() => {
    if (!myStation?.id) {
      setUptime(null)
      return
    }
    void loadUptime()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch uptime only when station identity changes
  }, [myStation?.id])

  useEffect(() => {
    const refFromUrl = searchParams.get('ref')?.trim() ?? ''
    if (refFromUrl) {
      setReferralCodeInput(refFromUrl.toUpperCase())
    }
  }, [searchParams])

  async function loadMyStation() {
    if (!user) return
    const { data, error } = await supabase
      .from('stations')
      .select('*')
      .eq('verified_owner_id', user.id)
      .maybeSingle()
    if (error) {
      setLoading(false)
      return
    }
    setMyStation(data ?? null)
    if (data) {
      setTier((data.subscription_tier_requested as SubscriptionTierRequested) ?? 'small')
      const reportedMonths = Number(data.subscription_duration_months)
      if ([3, 6, 12].includes(reportedMonths)) {
        setDurationMonths(reportedMonths as B2BDurationMonths)
      }
      setStationPhotos(data.station_photo_urls ?? [])
      setLocationPhoto(data.location_photo_url ?? null)
      setRecognitionPhotoUrl(data.recognition_photo_url ?? null)
      setEditableStationName(data.name ?? '')
      setEditableStationBrand(data.brand ?? '')
      if (data.referrer_user_id) {
        setReferralCodeInput('ASSIGNED')
      }
      await loadCurrentStatus(data.id)
    } else {
      setCurrentStatus(null)
    }
    setLoading(false)
  }

  async function loadCurrentStatus(stationId: string) {
    const { data } = await supabase
      .from('station_current_status')
      .select('*')
      .eq('station_id', stationId)
      .maybeSingle()
    setCurrentStatus((data as StationCurrentStatus) ?? null)
    if (data?.fuel_statuses_computed) {
      const next: Record<FuelCode, FuelStatusOrSkip> = {
        RON92: 'SKIP',
        RON95: 'SKIP',
        DIESEL: 'SKIP',
        PREMIUM_DIESEL: 'SKIP',
      }
      for (const code of FUEL_CODES) {
        const v = data.fuel_statuses_computed[code] as FuelStatus | undefined
        next[code] = v && v !== 'UNKNOWN' ? v : 'SKIP'
      }
      setFuelStatuses(next)
    }
  }

  async function submitRegistration(e: React.FormEvent) {
    e.preventDefault()
    if (!user || registering) return
    if (!session?.access_token) {
      setRegisterResult('error')
      setRegisterErrorMessage(t('stationOwner.registerSessionRequired'))
      return
    }
    setRegistering(true)
    setRegisterResult(null)
    setRegisterErrorMessage(null)
    try {
      const body: Record<string, unknown> = {
        name: registerForm.name.trim(),
        brand: registerForm.brand.trim() || null,
        address: registerForm.address.trim() || null,
        township: registerForm.township.trim() || undefined,
        city: registerForm.city.trim() || 'Yangon',
        subscription_tier_requested: tier,
        referral_code: referralCodeInput.trim() || null,
      }
      const lat = registerForm.lat
      const lng = registerForm.lng
      if (
        lat != null &&
        lng != null &&
        Number.isFinite(lat) &&
        Number.isFinite(lng)
      ) {
        body.lat = lat
        body.lng = lng
      }
      const { data, error } = await supabase.functions.invoke('register-station', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body,
      })
      if (error) throw error
      if (data?.error && typeof data.error === 'string') throw new Error(data.error)
      setRegisterResult('success')
      setRegisterForm({
        name: '',
        brand: '',
        address: '',
        township: '',
        city: 'Yangon',
        lat: null,
        lng: null,
      })
      void loadMyStation()
    } catch (err) {
      setRegisterResult('error')
      const msg =
        err != null && typeof (err as { message?: unknown }).message === 'string'
          ? (err as { message: string }).message
          : err instanceof Error
            ? err.message
            : null
      setRegisterErrorMessage(msg)
    } finally {
      setRegistering(false)
    }
  }

  function handleUseMyLocationForRegistration() {
    if (!navigator.geolocation) {
      setRegisterLocationError(t('stationOwner.registerLocationError'))
      return
    }
    setRegisterLocationLoading(true)
    setRegisterLocationError(null)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setRegisterForm((prev) => ({
          ...prev,
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }))
        setRegisterLocationLoading(false)
      },
      () => {
        setRegisterLocationError(t('stationOwner.registerLocationError'))
        setRegisterLocationLoading(false)
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    )
  }

  function handleConfirmMapPickerLocation() {
    const marker = mapPickerMarkerRef.current
    if (!marker) return
    const latLng = marker.getLatLng()
    setRegisterForm((prev) => ({ ...prev, lat: latLng.lat, lng: latLng.lng }))
    setRegisterLocationError(null)
    setShowMapPicker(false)
    setTimeout(() => pickOnMapButtonRef.current?.focus(), 0)
  }

  function openOwnerLocationPicker() {
    if (!myStation) return
    setOwnerLocationDraft({ lat: myStation.lat, lng: myStation.lng })
    setOwnerLocationPickerError(null)
    setSetLocationMessage(null)
    setShowOwnerLocationPicker(true)
  }

  function useCurrentLocationForOwnerPin() {
    if (!navigator.geolocation) {
      setOwnerLocationPickerError(t('stationOwner.setCorrectLocationGeolocationError'))
      return
    }
    setOwnerLocationPickerError(null)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }
        setOwnerLocationDraft(next)
        ownerLocationMarkerRef.current?.setLatLng([next.lat, next.lng])
        ownerLocationMapRef.current?.setView([next.lat, next.lng], 16, { animate: true })
      },
      () => {
        setOwnerLocationPickerError(t('stationOwner.setCorrectLocationGeolocationError'))
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    )
  }

  async function submitOwnerLocation(lat: number, lng: number) {
    if (!myStation?.id || !session?.access_token) return
    setSetLocationMessage(null)
    setSetLocationLoading(true)
    try {
      const { error } = await supabase.functions.invoke('owner-update-station-location', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: {
          station_id: myStation.id,
          lat,
          lng,
        },
      })
      if (!error) {
        setSetLocationMessage(t('stationOwner.setCorrectLocationUpdated'))
        setShowOwnerLocationPicker(false)
        void loadMyStation()
      } else {
        setSetLocationMessage(error.message ?? t('errors.generic'))
      }
    } catch {
      setSetLocationMessage(t('stationOwner.setCorrectLocationGeolocationError'))
    } finally {
      setSetLocationLoading(false)
    }
  }

  async function confirmOwnerLocationFromMap() {
    const marker = ownerLocationMarkerRef.current
    if (!marker) return
    const latLng = marker.getLatLng()
    setOwnerLocationDraft({ lat: latLng.lat, lng: latLng.lng })
    await submitOwnerLocation(latLng.lat, latLng.lng)
  }

  async function uploadVerificationPhoto(file: File, kind: 'station' | 'location') {
    if (!myStation || !user) return
    setUploading(true)
    setSaveMessage(null)
    try {
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `${user.id}/${myStation.id}/${kind}-${Date.now()}.${ext}`
      const { data, error } = await supabase.storage
        .from('station-verification')
        .upload(path, file, { upsert: true })

      if (error) throw error

      const { data: pub } = supabase.storage.from('station-verification').getPublicUrl(data.path)
      const url = pub.publicUrl

      if (kind === 'station') {
        const next = [...stationPhotos, url]
        setStationPhotos(next)
      } else {
        setLocationPhoto(url)
      }
      setSaveMessage(null)
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : t('errors.generic'))
    } finally {
      setUploading(false)
    }
  }

  async function saveVerificationInfo(): Promise<boolean> {
    if (!myStation) return false
    setSaveState('saving')
    setSaveMessage(null)
    try {
      const referralToSend = referralCodeInput === 'ASSIGNED' ? null : (referralCodeInput.trim() || null)
      const { data, error } = await supabase.functions.invoke('update-operator-verification', {
        body: {
          station_id: myStation.id,
          name: editableStationName.trim() || null,
          brand: editableStationBrand.trim() || null,
          subscription_tier_requested: tier,
          referral_code: referralToSend,
          station_photo_urls: stationPhotos,
          location_photo_url: locationPhoto,
        },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      setSaveState('success')
      setSaveMessage(
        data?.referral_matched
          ? t('stationOwner.referralSavedWithCode', { code: data.referral_matched })
          : t('stationOwner.referralSaved')
      )
      await loadMyStation()
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : t('errors.generic')
      if (message.toLowerCase().includes('own referral')) {
        setSaveMessage(t('stationOwner.ownReferralCode'))
      } else if (message.toLowerCase().includes('invalid referral')) {
        setSaveMessage(t('stationOwner.invalidReferralCode'))
      } else {
        setSaveMessage(message)
      }
      setSaveState('error')
      return false
    }
  }

  async function markIHavePaid() {
    if (!myStation || submittingPaid || !ownerPaymentReference.trim()) return
    setSubmittingPaid(true)
    setSaveMessage(null)
    try {
      const saved = await saveVerificationInfo()
      if (!saved) {
        setSubmittingPaid(false)
        return
      }
      const { data, error } = await supabase.functions.invoke('operator-report-payment', {
        body: {
          station_id: myStation.id,
          payment_method: 'KBZ_PAY',
          payment_reference: ownerPaymentReference.trim(),
          duration_months: durationMonths,
          screenshot_path: ownerScreenshotPath || undefined,
        },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      setSaveMessage(
        data?.already_reported
          ? t('stationOwner.paymentAlreadyReported')
          : t('stationOwner.weWillVerifySoon'),
      )
      await loadMyStation()
    } catch {
      setSaveMessage(t('errors.generic'))
    } finally {
      setSubmittingPaid(false)
    }
  }

  async function handleOwnerPaymentScreenshot(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !user || !myStation) return
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    if (!['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
      setSaveMessage(t('b2b.invalidImageType'))
      return
    }
    setUploadingPaymentScreenshot(true)
    setSaveMessage(null)
    try {
      const path = `${user.id}/station-${myStation.id}-${crypto.randomUUID()}.${ext}`
      const { error: uploadErr } = await supabase.storage.from(PAYMENT_SCREENSHOT_BUCKET).upload(path, file, {
        contentType: file.type,
        upsert: false,
      })
      if (uploadErr) throw uploadErr
      setOwnerScreenshotPath(path)
    } catch {
      setSaveMessage(t('errors.generic'))
    } finally {
      setUploadingPaymentScreenshot(false)
      e.target.value = ''
    }
  }

  async function uploadRecognitionPhoto(file: File) {
    if (!myStation || !user) return
    setUploading(true)
    setSaveMessage(null)
    try {
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `${user.id}/${myStation.id}/recognition-${Date.now()}.${ext}`
      const { data, error } = await supabase.storage
        .from('recognition-photos')
        .upload(path, file, { upsert: true })
      if (error) throw error
      const { data: pub } = supabase.storage.from('recognition-photos').getPublicUrl(data.path)
      setRecognitionPhotoUrl(pub.publicUrl)
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : t('errors.generic'))
    } finally {
      setUploading(false)
    }
  }

  async function confirmRecognitionPhoto() {
    if (!myStation || !recognitionPhotoUrl) return
    setRecognitionConfirming(true)
    setSaveMessage(null)
    try {
      const { data, error } = await supabase.functions.invoke('update-recognition-photo', {
        body: {
          station_id: myStation.id,
          recognition_photo_url: recognitionPhotoUrl,
          recognition_photo_confirmed: true,
        },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      setSaveMessage('Recognition photo confirmed for hero section.')
      await loadMyStation()
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : t('errors.generic'))
    } finally {
      setRecognitionConfirming(false)
    }
  }

  const canPostFuelUpdate = useMemo(
    () => FUEL_CODES.some((code) => fuelStatuses[code] !== 'SKIP'),
    [fuelStatuses],
  )

  useEffect(() => {
    setPostResult(null)
  }, [fuelStatuses])

  async function postUpdate() {
    if (!myStation || !user) return
    setPostResult(null)
    setPosting(true)
    try {
      const fs: FuelStatuses = {}
      for (const code of FUEL_CODES) {
        const v = fuelStatuses[code]
        if (v !== 'SKIP') fs[code] = v
      }

      if (Object.keys(fs).length === 0) {
        setPostResult('needFuel')
        return
      }

      const deviceHash = await getDeviceHash()
      const { data, error } = await supabase.functions.invoke('submit-report', {
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : undefined,
        body: {
          station_id: myStation.id,
          device_hash: deviceHash,
          fuel_statuses: fs,
          queue_bucket: queue,
          reporter_role: 'VERIFIED_STATION',
        },
      })

      if (error) {
        setPostResult('error')
        return
      }
      if (data && typeof data === 'object' && typeof (data as { error?: unknown }).error === 'string') {
        setPostResult('error')
        return
      }

      setPostResult('success')
    } catch {
      setPostResult('error')
    } finally {
      setPosting(false)
    }
  }

  if (!user) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <div>
          <Store className="mx-auto mb-3 h-12 w-12 text-gray-700" />
          <p className="text-gray-700 mb-3">{t('auth.signIn')}</p>
          <Button onClick={() => navigate(authRedirectPath)}>{t('auth.signIn')}</Button>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {showMapPicker && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-white">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-200 bg-gray-50 px-4 py-3">
            <button
              ref={mapPickerCloseButtonRef}
              type="button"
              onClick={() => {
                setShowMapPicker(false)
                setRegisterLocationError(null)
                setTimeout(() => pickOnMapButtonRef.current?.focus(), 0)
              }}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-gray-700 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label={t('common.close')}
            >
              <X className="h-5 w-5" />
            </button>
            <span className="text-sm font-medium text-gray-900">{t('stationOwner.registerLocationLabel')}</span>
            <Button size="sm" variant="primary" onClick={handleConfirmMapPickerLocation}>
              {t('stationOwner.registerUseThisLocation')}
            </Button>
          </div>
          <div ref={mapPickerContainerRef} className="min-h-[50vh] flex-1" />
        </div>
      )}

      {showOwnerLocationPicker && myStation && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-white">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-200 bg-gray-50 px-4 py-3">
            <button
              type="button"
              onClick={() => {
                setShowOwnerLocationPicker(false)
                setOwnerLocationPickerError(null)
              }}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-gray-700 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label={t('common.close')}
            >
              <X className="h-5 w-5" />
            </button>
            <span className="text-sm font-medium text-gray-900">{t('stationOwner.setCorrectLocationTitle')}</span>
            <Button size="sm" variant="primary" loading={setLocationLoading} onClick={() => void confirmOwnerLocationFromMap()}>
              {t('stationOwner.setCorrectLocationSaveFromMap')}
            </Button>
          </div>
          <div className="border-b border-gray-200 bg-white px-4 py-3">
            <p className="text-sm font-medium text-gray-900">{myStation.name}</p>
            <p className="mt-1 text-xs text-gray-700">
              {t('stationOwner.setCorrectLocationCurrentPin', {
                lat: myStation.lat.toFixed(5),
                lng: myStation.lng.toFixed(5),
              })}
            </p>
            {ownerLocationDraft && (
              <p className="mt-1 text-xs text-gray-700">
                {t('stationOwner.setCorrectLocationSelectedPin', {
                  lat: ownerLocationDraft.lat.toFixed(5),
                  lng: ownerLocationDraft.lng.toFixed(5),
                })}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={setLocationLoading}
                onClick={useCurrentLocationForOwnerPin}
              >
                <Crosshair className="h-4 w-4" />
                {t('stationOwner.setCorrectLocationUseGps')}
              </Button>
            </div>
            {ownerLocationPickerError && (
              <p className="mt-2 text-xs text-red-600">{ownerLocationPickerError}</p>
            )}
            {setLocationMessage && (
              <p className="mt-2 text-xs text-gray-700">{setLocationMessage}</p>
            )}
          </div>
          <div ref={ownerLocationContainerRef} className="min-h-[50vh] flex-1" />
        </div>
      )}

      <div className="border-b border-gray-100 bg-white px-4 py-3">
        <h1 className="text-lg font-bold text-gray-900">{t('stationOwner.title')}</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {showPlanSelection && (
          <section className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <h2 className="mb-3 text-sm font-bold text-gray-900">{t('stationOwner.selectTier')}</h2>
            <div className="grid gap-2 sm:grid-cols-3">
              {(['small', 'medium', 'large'] as const).map((tierOption) => {
                const selected = tier === tierOption
                return (
                  <button
                    key={tierOption}
                    type="button"
                    onClick={() => setTier(tierOption)}
                    className={`rounded-xl border p-3 text-left ${selected ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white'}`}
                  >
                    <p className="font-semibold text-gray-900">{t(`stationOwner.${tierOption}`)}</p>
                  </button>
                )
              })}
            </div>

            <h2 className="mb-3 mt-4 text-sm font-bold text-gray-900">{t('b2b.choosePlanDuration')}</h2>
            {pricingLoading ? (
              <div className="flex justify-center py-4">
                <Spinner />
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-3">
                {DURATION_OPTIONS.map((m) => {
                  const quote = quoteB2BPrice(pricingConfig, m)
                  const selected = durationMonths === m
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setDurationMonths(m)}
                      className={`rounded-xl border p-3 text-left ${selected ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white'}`}
                    >
                      <p className="font-semibold text-gray-900">{t('b2b.durationLabel', { months: m })}</p>
                      <p className="mt-2 text-sm font-bold text-gray-900">{formatMmk(quote.paid)}</p>
                      {quote.promoOn && quote.savings > 0 ? (
                        <>
                          <p className="text-xs text-gray-700 line-through">{formatMmk(quote.list)}</p>
                          <p className="text-xs font-semibold text-green-700">
                            {t('b2b.promoSavingsLine', { percent: quote.promoPercent, savings: formatMmk(quote.savings) })}
                          </p>
                        </>
                      ) : (
                        <p className="text-xs text-gray-700">{t('b2b.listPriceOnly')}</p>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
            <p className="mt-3 text-xs text-gray-700">
              {t('b2b.selectedDurationSummary', { months: durationMonths })} · {formatMmk(selectedDurationQuote.paid)}
            </p>
            <p className="mt-4 text-sm font-medium text-gray-800">{t('stationOwner.whatYouGetTitle')}</p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-gray-700">
              <li>{t('stationOwner.whatYouGetReliability')}</li>
              <li>{t('stationOwner.whatYouGetUptime')}</li>
              <li>{t('stationOwner.whatYouGetCompare')}</li>
            </ul>
            <p className="mt-2">
              <Link to="/benefits/station-owners" className="text-xs font-medium text-blue-600 underline active:text-blue-800">
                {t('stationOwner.seeFullBenefits')}
              </Link>
            </p>
          </section>
        )}

        {myStation && ownerPortalState !== 'draft' && (
          <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
            <p className="text-sm font-semibold text-blue-900">{t('stationOwner.portalStatusTitle')}</p>
            <p className="mt-1 text-sm text-blue-900">
              {ownerPortalState === 'payment_submitted'
                ? t('stationOwner.portalStatusPaymentSubmitted')
                : ownerPortalState === 'payment_confirmed'
                  ? t('stationOwner.portalStatusPaymentConfirmed')
                  : t('stationOwner.portalStatusVerified')}
            </p>
            {myStation.subscription_duration_months != null && (
              <p className="mt-2 text-xs text-blue-900">
                {t('b2b.selectedDurationSummary', { months: myStation.subscription_duration_months })}
              </p>
            )}
          </section>
        )}

        {/* No station yet: Register (owner-first) or Claim existing */}
        {!myStation && (
          <>
            <div className="rounded-2xl bg-white border border-gray-200 p-5">
              <Store className="mb-2 h-8 w-8 text-blue-500" />
              <h2 className="font-semibold text-gray-900">{t('stationOwner.registerTitle')}</h2>
              <p className="mt-1 text-sm text-gray-700">{t('stationOwner.registerIntro')}</p>
              <form onSubmit={submitRegistration} className="mt-4 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    {t('stationOwner.registerFormName')} *
                  </label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    value={registerForm.name}
                    onChange={(e) => setRegisterForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="e.g. Myanmar Petroleum Station"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    {t('stationOwner.registerFormBrand')}
                  </label>
                  <input
                    type="text"
                    value={registerForm.brand}
                    onChange={(e) => setRegisterForm((f) => ({ ...f, brand: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="e.g. MPE, PTT (optional)"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    {t('stationOwner.registerFormAddress')}
                  </label>
                  <input
                    type="text"
                    value={registerForm.address}
                    onChange={(e) => setRegisterForm((f) => ({ ...f, address: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="Street, road"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      {t('stationOwner.registerFormTownship')}
                    </label>
                    <input
                      type="text"
                      value={registerForm.township}
                      onChange={(e) => setRegisterForm((f) => ({ ...f, township: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      {t('stationOwner.registerFormCity')}
                    </label>
                    <input
                      type="text"
                      value={registerForm.city}
                      onChange={(e) => setRegisterForm((f) => ({ ...f, city: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    {t('stationOwner.referralCode')}
                  </label>
                  <input
                    type="text"
                    value={referralCodeInput}
                    onChange={(e) => setReferralCodeInput(e.target.value.toUpperCase())}
                    placeholder={t('stationOwner.referralCodePlaceholder')}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base text-gray-900 placeholder-gray-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <p className="mt-1 text-[11px] text-gray-700">{t('stationOwner.referralCodeOptionalNote')}</p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    {t('stationOwner.registerLocationLabel')}
                  </label>
                  {registerForm.lat != null &&
                  registerForm.lng != null &&
                  Number.isFinite(registerForm.lat) &&
                  Number.isFinite(registerForm.lng) ? (
                    <p className="mb-2 text-xs text-gray-700">
                      {t('stationOwner.registerLocationSet', {
                        lat: Number(registerForm.lat).toFixed(5),
                        lng: Number(registerForm.lng).toFixed(5),
                      })}
                    </p>
                  ) : (
                    <p className="mb-2 text-xs text-gray-700">
                      {t('stationOwner.registerLocationNotSet')}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={registerLocationLoading || registering}
                      onClick={handleUseMyLocationForRegistration}
                      aria-busy={registerLocationLoading}
                    >
                      {registerLocationLoading ? (
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
                      ) : (
                        <Crosshair className="h-4 w-4" />
                      )}
                      {t('stationOwner.registerUseMyLocation')}
                    </Button>
                    <Button
                      ref={pickOnMapButtonRef}
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={registering}
                      onClick={() => {
                        setRegisterLocationError(null)
                        setRegisterResult(null)
                        setRegisterErrorMessage(null)
                        setShowMapPicker(true)
                      }}
                    >
                      <MapPin className="h-4 w-4" />
                      {t('stationOwner.registerPickOnMap')}
                    </Button>
                    {registerForm.lat != null &&
                      registerForm.lng != null &&
                      Number.isFinite(registerForm.lat) &&
                      Number.isFinite(registerForm.lng) && (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={registering}
                        onClick={() => {
                          setRegisterForm((f) => ({ ...f, lat: null, lng: null }))
                          setRegisterLocationError(null)
                        }}
                      >
                        {t('stationOwner.registerLocationClear')}
                      </Button>
                    )}
                  </div>
                  {registerLocationError && (
                    <p className="mt-2 text-xs text-red-600">{registerLocationError}</p>
                  )}
                </div>

                {registerResult === 'success' && (
                  <p className="text-sm text-green-600">{t('stationOwner.registerSuccess')}</p>
                )}
                {registerResult === 'error' && (
                  <p className="text-sm text-red-600">
                    {registerErrorMessage ?? t('stationOwner.registerError')}
                  </p>
                )}
                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  loading={registering}
                  disabled={!session?.access_token}
                >
                  {t('stationOwner.registerSubmit')}
                </Button>
              </form>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm font-semibold text-gray-800">{t('stationOwner.claimExistingTitle')}</p>
              <p className="mt-0.5 text-xs text-gray-700">{t('stationOwner.claimExistingDesc')}</p>
              <Button
                variant="secondary"
                size="md"
                className="mt-3"
                onClick={() => navigate('/home')}
              >
                <MapPin className="h-4 w-4" />
                {t('stationOwner.claimButton')}
              </Button>
            </div>
          </>
        )}

        {/* Has verified station */}
        {myStation && (
          <>
            <div className={`rounded-2xl border p-4 ${myStation.is_verified ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
              <div className="flex items-center gap-2">
                <CheckCircle className={`h-5 w-5 ${myStation.is_verified ? 'text-green-600' : 'text-amber-600'}`} />
                <span className={`font-semibold ${myStation.is_verified ? 'text-green-900' : 'text-amber-900'}`}>
                  {myStation.name}
                </span>
              </div>
              <p className={`mt-1 text-xs ${myStation.is_verified ? 'text-green-700' : 'text-amber-700'}`}>
                {myStation.township}
                {myStation.is_verified ? ` · ${t('station.verified')}` : ` · ${t('stationOwner.pendingVerification')}`}
              </p>
                {myStation.registration_reject_reason ? (
                <p className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-700">
                  {t('stationOwner.registrationRejectedReason')}: {myStation.registration_reject_reason}
                </p>
              ) : null}
            </div>

            {!myStation.is_verified && (
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                <h3 className="font-semibold text-blue-900">{t('stationOwner.completeVerification')}</h3>
                <p className="mt-1 text-xs text-blue-800">{t('stationOwner.paymentInstructions')}</p>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-700">{t('stationOwner.registerFormName')}</label>
                    <input
                      type="text"
                      value={editableStationName}
                      onChange={(e) => setEditableStationName(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="Station name"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-gray-700">{t('stationOwner.registerFormBrand')}</label>
                    <input
                      type="text"
                      value={editableStationBrand}
                      onChange={(e) => setEditableStationBrand(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="e.g. MPE, PTT (optional)"
                    />
                  </div>
                </div>

                <div className="mt-3">
                  <label className="mb-1 block text-xs font-semibold text-gray-700">{t('stationOwner.referralCode')}</label>
                  <input
                    value={referralCodeInput === 'ASSIGNED' ? '' : referralCodeInput}
                    onChange={(e) => setReferralCodeInput(e.target.value)}
                    placeholder={t('stationOwner.referralCodePlaceholder')}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <p className="mt-1 text-[11px] text-gray-700">{t('stationOwner.referralCodeOptionalNote')}</p>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="rounded-xl border border-gray-200 bg-white p-3 text-sm text-gray-700">
                    <span className="mb-2 block font-medium text-gray-900">{t('admin.stationPhotos')}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) void uploadVerificationPhoto(f, 'station')
                      }}
                    />
                    <p className="mt-2 text-xs text-gray-700">Uploaded: {stationPhotos.length}</p>
                  </label>
                  <label className="rounded-xl border border-gray-200 bg-white p-3 text-sm text-gray-700">
                    <span className="mb-2 block font-medium text-gray-900">{t('admin.locationPhoto')}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) void uploadVerificationPhoto(f, 'location')
                      }}
                    />
                    <p className="mt-2 text-xs text-gray-700">{locationPhoto ? 'Uploaded' : 'Missing'}</p>
                  </label>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={saveState === 'saving' || uploading}
                    onClick={() => void saveVerificationInfo()}
                    disabled={uploading}
                  >
                    <Upload className="h-4 w-4" />
                    {t('stationOwner.completeVerification')}
                  </Button>
                </div>

                {saveMessage ? <p className="mt-3 text-sm text-gray-700">{saveMessage}</p> : null}
              </div>
            )}

            {/* Pay via — same section as B2B: instructions, QR, phone */}
            {!myStation.is_verified && !myStation.payment_reported_at && (
              <section className="rounded-2xl border border-gray-200 bg-white p-4">
                <h2 className="text-sm font-bold text-gray-900 mb-3">{t('b2b.payVia')}</h2>
                {paymentConfigLoading ? (
                  <div className="flex justify-center py-4">
                    <Spinner />
                  </div>
                ) : paymentInstructions ? (
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
                    {paymentInstructions}
                  </div>
                ) : (
                  <p className="text-xs text-gray-700">{t('b2b.contactForPayment')}</p>
                )}
                {paymentConfigError && (
                  <p className="mt-3 text-xs text-amber-800">{t('b2b.paymentConfigUnavailable')}</p>
                )}
                {paymentQrUrl ? (
                  <div className="mt-3">
                    <p className="text-xs font-medium text-gray-700 mb-1">QR code</p>
                    <img src={paymentQrUrl} alt="Payment QR" className="h-40 w-40 rounded border border-gray-200 object-cover" />
                  </div>
                ) : null}
                {paymentPhoneKpay ? (
                  <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
                    <p>
                      KPay / KBZ Pay:{' '}
                      <a href={`tel:${paymentPhoneKpay.replace(/\s/g, '')}`} className="font-semibold text-blue-600 underline">
                        {paymentPhoneKpay}
                      </a>
                    </p>
                  </div>
                ) : null}
              </section>
            )}

            {/* Payment details — same section as B2B: method, reference, screenshot, submit */}
            {!myStation.is_verified && !myStation.payment_reported_at && (
              <section className="rounded-2xl border border-gray-200 bg-white p-4">
                <h2 className="text-sm font-bold text-gray-900 mb-3">{t('b2b.paymentDetails')}</h2>
                <div className="space-y-3">
                  <p className="text-xs text-gray-700">{t('b2b.kpayOnlyNotice')}</p>
                  <div>
                    <label htmlFor="owner-payment-ref" className="mb-1.5 block text-xs font-medium text-gray-700">
                      {t('admin.paymentReference')} *
                    </label>
                    <input
                      id="owner-payment-ref"
                      type="text"
                      value={ownerPaymentReference}
                      onChange={(e) => setOwnerPaymentReference(e.target.value)}
                      placeholder="e.g. Transaction ID or last 4 digits"
                      className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-gray-700">{t('b2b.uploadScreenshot')}</p>
                    <p className="mb-2 text-[11px] text-gray-700">{t('b2b.uploadScreenshotHint')}</p>
                    <input
                      ref={paymentScreenshotInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="sr-only"
                      onChange={handleOwnerPaymentScreenshot}
                      aria-label={t('b2b.uploadScreenshot')}
                    />
                    {ownerScreenshotPath ? (
                      <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                        <span className="text-sm text-gray-700 truncate flex-1">{t('b2b.screenshotUploaded')}</span>
                        <button
                          type="button"
                          onClick={() => setOwnerScreenshotPath(null)}
                          className="shrink-0 rounded p-1 text-gray-700 hover:bg-gray-200"
                          aria-label={t('b2b.removeScreenshot')}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={uploadingPaymentScreenshot}
                        onClick={() => paymentScreenshotInputRef.current?.click()}
                      >
                        {uploadingPaymentScreenshot ? <Spinner className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
                        {uploadingPaymentScreenshot ? t('b2b.uploadingScreenshot') : t('b2b.uploadScreenshot')}
                      </Button>
                    )}
                  </div>
                </div>
                <Button
                  variant="primary"
                  className="w-full mt-4"
                  loading={submittingPaid}
                  onClick={() => void markIHavePaid()}
                  disabled={stationPhotos.length === 0 || !locationPhoto || !ownerPaymentReference.trim()}
                >
                  {t('stationOwner.iHavePaid')}
                </Button>
              </section>
            )}

            {!myStation.is_verified && myStation.payment_reported_at && (
              <p className="text-sm text-gray-700">
                {t('stationOwner.paymentReportedAt')}: {new Date(myStation.payment_reported_at).toLocaleString()}
              </p>
            )}

            {currentStatus && (
              <div className="rounded-2xl border border-gray-200 bg-white p-4">
                <p className="font-semibold text-gray-900">{t('stationOwner.currentStatus')}</p>
                <p className="mt-1 text-xs text-gray-700">{t('stationOwner.updateFuelStatusDescription')}</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {FUEL_CODES.map((code) => {
                    const v = currentStatus.fuel_statuses_computed?.[code] ?? 'UNKNOWN'
                    return (
                      <div key={code} className="rounded-lg border border-gray-200 px-2 py-1.5">
                        <p className="text-xs text-gray-700">{FUEL_DISPLAY[code][lang]}</p>
                        <p className="text-sm font-semibold text-gray-900">{STATUS_LABEL[v][lang]}</p>
                      </div>
                    )
                  })}
                </div>
                <p className="mt-2 text-xs text-gray-700">
                  {currentStatus.last_updated_at ? formatRelativeTime(currentStatus.last_updated_at) : '—'} · {QUEUE_LABEL[currentStatus.queue_bucket_computed ?? 'NONE'][lang]}
                </p>
              </div>
            )}

            {myStation.payment_received_at && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="font-semibold text-emerald-900">{t('stationOwner.setCorrectLocationTitle')}</p>
                <p className="mt-1 text-xs text-emerald-800">{t('stationOwner.setCorrectLocationHint')}</p>
                <p className="mt-2 text-xs text-emerald-800">
                  {t('stationOwner.setCorrectLocationCurrentPin', {
                    lat: myStation.lat.toFixed(5),
                    lng: myStation.lng.toFixed(5),
                  })}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={setLocationLoading}
                    disabled={!session?.access_token}
                    onClick={openOwnerLocationPicker}
                  >
                    {t('stationOwner.setCorrectLocationReviewOnMap')}
                  </Button>
                </div>
                {setLocationMessage && (
                  <p className="mt-2 text-xs text-emerald-800">{setLocationMessage}</p>
                )}
              </div>
            )}

            {myStation.is_verified && (
              <div className="rounded-2xl border border-gray-200 bg-white p-4">
                <p className="font-semibold text-gray-900">{t('stationOwner.yourStationReliability')}</p>
                <p className="mt-1 text-xs text-gray-700">{t('stationOwner.reliabilityDescription')}</p>
                {reliability ? (
                  <div className="mt-3 space-y-2 text-sm">
                    <p className="text-gray-700">
                      {t('stationOwner.reportsLast7d')}: <strong>{reliability.reports_last_7d}</strong>
                      {reliability.verified_last_7d > 0 && (
                        <span className="ml-2 text-gray-700">({t('stationOwner.verifiedUpdates')}: {reliability.verified_last_7d})</span>
                      )}
                    </p>
                    <p className="text-gray-700">
                      {t('stationOwner.reportsLast30d')}: <strong>{reliability.reports_last_30d}</strong>
                      {reliability.verified_last_30d > 0 && (
                        <span className="ml-2 text-gray-700">({t('stationOwner.verifiedUpdates')}: {reliability.verified_last_30d})</span>
                      )}
                    </p>
                    {reliability.last_updated_at && (
                      <p className="text-xs text-gray-700">{t('stationOwner.lastUpdated')}: {formatRelativeTime(reliability.last_updated_at)}</p>
                    )}
                    {reliability.city_name != null && reliability.city_stations_count != null && reliability.city_avg_reports_7d != null && (
                      <p className="text-xs text-gray-700 mt-2">
                        {t('stationOwner.vsCity', {
                          city: reliability.city_name,
                          count: reliability.city_stations_count,
                          avg7: reliability.city_avg_reports_7d,
                          avg30: reliability.city_avg_reports_30d ?? '—',
                        })}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-gray-700">{t('stationOwner.reliabilityNoData')}</p>
                )}
              </div>
            )}

            {myStation.is_verified && (
              <div className="rounded-2xl border border-gray-200 bg-white p-4">
                <p className="font-semibold text-gray-900">{t('stationOwner.uptime30d')}</p>
                <p className="mt-1 text-xs text-gray-700">{t('stationOwner.uptimeDescription')}</p>
                {uptime?.has_sufficient_data && uptime.uptime_pct != null ? (
                  <p className="mt-3 text-sm text-gray-700">
                    {t('stationOwner.uptimeValue', { pct: uptime.uptime_pct })}
                  </p>
                ) : (
                  <p className="mt-3 text-sm text-gray-700">{t('stationOwner.uptimeCollectingData')}</p>
                )}
              </div>
            )}

            {myStation.is_verified && (
              <div className="rounded-2xl border border-purple-200 bg-purple-50 p-4">
                <p className="font-semibold text-purple-900">Hero recognition photo</p>
                <p className="mt-1 text-xs text-purple-800">
                  Prefer a photo with both referrer and owner (or manager). You can upload now and publish when ready.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <label className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) void uploadRecognitionPhoto(f)
                      }}
                    />
                  </label>
                  {recognitionPhotoUrl ? (
                    <img src={recognitionPhotoUrl} alt="Recognition" className="h-20 w-20 rounded border border-gray-200 object-cover" />
                  ) : null}
                </div>
                <div className="mt-3">
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={recognitionConfirming}
                    onClick={() => void confirmRecognitionPhoto()}
                    disabled={!recognitionPhotoUrl}
                  >
                    Confirm and show on FuelBot
                  </Button>
                </div>
              </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-white border border-gray-100 p-3 text-center">
                <Users className="mx-auto h-5 w-5 text-gray-700 mb-1" />
                <p className="text-xs text-gray-700">{t('stationOwner.followers')}</p>
                <p className="text-lg font-bold text-gray-800">—</p>
              </div>
              <div className="rounded-xl bg-white border border-gray-100 p-3 text-center">
                <Send className="mx-auto h-5 w-5 text-gray-700 mb-1" />
                <p className="text-xs text-gray-700">{t('stationOwner.confirmations')}</p>
                <p className="text-lg font-bold text-gray-800">—</p>
              </div>
            </div>

            {/* Post update — only when verified */}
            <div className="rounded-2xl bg-white border border-gray-200 p-4">
              <p className="font-semibold text-gray-800 mb-1">{t('stationOwner.postUpdate')}</p>
              {!myStation.is_verified ? (
                <p className="text-sm text-amber-700 mb-3">{t('stationOwner.postAfterApproval')}</p>
              ) : (
                <>
                  <p className="text-xs text-gray-700 mb-3">{t('stationOwner.postUpdateHint')}</p>
                  {!canPostFuelUpdate && (
                    <p className="mb-2 text-xs text-gray-600">{t('stationOwner.postUpdateSelectFuelHint')}</p>
                  )}

                  <div className="space-y-3">
                {FUEL_CODES.map((code) => (
                  <div key={code}>
                    <p className="text-xs font-medium text-gray-700 mb-1">
                      {FUEL_DISPLAY[code][lang]}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {(['AVAILABLE', 'LIMITED', 'OUT', 'SKIP'] as const).map((v) => (
                        <button
                          key={v}
                          onClick={() =>
                            setFuelStatuses((prev) => ({ ...prev, [code]: v }))
                          }
                          className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition-all ${
                            fuelStatuses[code] === v
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                          }`}
                        >
                          {v === 'SKIP'
                            ? t('report.fuelStatus.dontKnow')
                            : STATUS_LABEL[v as FuelStatus][lang]}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {postResult === 'success' && (
                <p className="mt-3 text-sm text-green-600">{t('report.success')}</p>
              )}
              {postResult === 'needFuel' && (
                <p className="mt-3 text-sm text-amber-800">{t('stationOwner.postUpdateNeedFuel')}</p>
              )}
              {postResult === 'error' && (
                <p className="mt-3 text-sm text-red-600">{t('report.error')}</p>
              )}

              <Button
                variant="primary"
                size="lg"
                className="mt-4 w-full"
                loading={posting}
                disabled={!myStation.is_verified || !canPostFuelUpdate}
                onClick={() => void postUpdate()}
              >
                <Send className="h-4 w-4" />
                {t('stationOwner.postUpdate')}
              </Button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
