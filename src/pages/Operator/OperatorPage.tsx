import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Store, CheckCircle, Send, Users, MapPin, Upload, Copy } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { FUEL_CODES, FUEL_DISPLAY, STATUS_LABEL, QUEUE_LABEL, formatRelativeTime } from '@/lib/fuelUtils'
import type { Station, FuelCode, FuelStatus, QueueBucket, FuelStatuses, StationCurrentStatus, SubscriptionTierRequested } from '@/types'
import { SUBSCRIPTION_TIERS, formatMmk, getTierPrice } from '@/lib/subscriptionTiers'
import { referralAmountForTier } from '@/lib/referrals'

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
interface ReferralRewardRow {
  id: string
  station_id: string
  amount_mmk: number
  status: string
  paid_at: string | null
  created_at: string
  stations: { name: string } | null
}

export function OperatorPage() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'en' | 'my'
  const { user, session, loading: authLoading } = useAuthStore()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [myStation, setMyStation] = useState<Station | null>(null)
  const [currentStatus, setCurrentStatus] = useState<StationCurrentStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [posting, setPosting] = useState(false)
  const [postResult, setPostResult] = useState<'success' | 'error' | null>(null)
  const [registering, setRegistering] = useState(false)
  const [registerResult, setRegisterResult] = useState<'success' | 'error' | null>(null)
  const [registerForm, setRegisterForm] = useState({ name: '', address: '', township: '', city: 'Yangon' })
  const [fuelStatuses, setFuelStatuses] = useState<Record<FuelCode, FuelStatusOrSkip>>({
    RON92: 'SKIP',
    RON95: 'SKIP',
    DIESEL: 'SKIP',
    PREMIUM_DIESEL: 'SKIP',
  })
  const [queue] = useState<QueueBucket>('NONE')
  const [tier, setTier] = useState<SubscriptionTierRequested>('small')
  const [referralCodeInput, setReferralCodeInput] = useState('')
  const [myReferralCode, setMyReferralCode] = useState('')
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [stationPhotos, setStationPhotos] = useState<string[]>([])
  const [locationPhoto, setLocationPhoto] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [submittingPaid, setSubmittingPaid] = useState(false)
  const [recognitionPhotoUrl, setRecognitionPhotoUrl] = useState<string | null>(null)
  const [recognitionConfirming, setRecognitionConfirming] = useState(false)
  const referralCodeFetchedRef = useRef(false)
  const [myReferralRewards, setMyReferralRewards] = useState<ReferralRewardRow[]>([])
  const [reliability, setReliability] = useState<ReliabilityRow | null>(null)
  const [uptime, setUptime] = useState<UptimeRow | null>(null)

  const selectedTierPrice = useMemo(() => getTierPrice(tier), [tier])
  const selectedReferralAmount = useMemo(() => referralAmountForTier(tier), [tier])
  const paymentInstructions = import.meta.env.VITE_PAYMENT_INSTRUCTIONS
  const paymentQrUrl = import.meta.env.VITE_PAYMENT_QR_URL
  const paymentPhoneWavePay = import.meta.env.VITE_PAYMENT_PHONE_WAVEPAY?.trim() || ''
  const paymentPhoneKpay = import.meta.env.VITE_PAYMENT_PHONE_KPAY?.trim() || ''
  const shareLink =
    myReferralCode && typeof window !== 'undefined'
      ? `${window.location.origin}/operator?ref=${encodeURIComponent(myReferralCode)}`
      : ''

  useEffect(() => {
    if (!user) return
    void loadMyStation()
  }, [user?.id])

  async function loadMyReferralRewards() {
    if (!user) return
    const { data } = await supabase
      .from('referral_rewards')
      .select('id, station_id, amount_mmk, status, paid_at, created_at, stations(name)')
      .eq('referrer_user_id', user.id)
      .order('created_at', { ascending: false })
    setMyReferralRewards((data ?? []) as unknown as ReferralRewardRow[])
  }

  useEffect(() => {
    if (!user) return
    void loadMyReferralRewards()
  }, [user?.id])

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
  }, [myStation?.id])

  useEffect(() => {
    if (!user) referralCodeFetchedRef.current = false
  }, [user])

  // Only fetch referral code when we have a valid session (avoids 401s from calling before auth is ready). Run once per session.
  useEffect(() => {
    if (!user?.id || !session || authLoading || referralCodeFetchedRef.current) return
    referralCodeFetchedRef.current = true
    void loadMyReferralCode()
  }, [user?.id, session?.access_token, authLoading])

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
      setStationPhotos(data.station_photo_urls ?? [])
      setLocationPhoto(data.location_photo_url ?? null)
      setRecognitionPhotoUrl(data.recognition_photo_url ?? null)
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

  async function loadMyReferralCode() {
    if (!user || !session?.access_token) return
    try {
      const { data, error } = await supabase.functions.invoke('get-referral-code', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!error && data?.code) setMyReferralCode(data.code)
    } catch {
      referralCodeFetchedRef.current = false
    }
  }

  async function submitRegistration(e: React.FormEvent) {
    e.preventDefault()
    if (!user || registering) return
    setRegistering(true)
    setRegisterResult(null)
    try {
      const { error } = await supabase.functions.invoke('register-station', {
        body: {
          name: registerForm.name.trim(),
          address: registerForm.address.trim() || null,
          township: registerForm.township.trim() || undefined,
          city: registerForm.city.trim() || 'Yangon',
          subscription_tier_requested: tier,
          referral_code: referralCodeInput.trim() || null,
        },
      })
      if (error) throw error
      setRegisterResult('success')
      setRegisterForm({ name: '', address: '', township: '', city: 'Yangon' })
      void loadMyStation()
    } catch {
      setRegisterResult('error')
    } finally {
      setRegistering(false)
    }
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
          ? t('operator.referralSavedWithCode', { code: data.referral_matched })
          : t('operator.referralSaved')
      )
      await loadMyStation()
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : t('errors.generic')
      if (message.toLowerCase().includes('own referral')) {
        setSaveMessage(t('operator.ownReferralCode'))
      } else if (message.toLowerCase().includes('invalid referral')) {
        setSaveMessage(t('operator.invalidReferralCode'))
      } else {
        setSaveMessage(message)
      }
      setSaveState('error')
      return false
    }
  }

  async function markIHavePaid() {
    if (!myStation || submittingPaid) return
    setSubmittingPaid(true)
    setSaveMessage(null)
    try {
      const saved = await saveVerificationInfo()
      if (!saved) {
        setSubmittingPaid(false)
        return
      }
      const { data, error } = await supabase.functions.invoke('operator-report-payment', {
        body: { station_id: myStation.id },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      setSaveMessage(t('operator.weWillVerifySoon'))
      await loadMyStation()
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : t('errors.generic'))
    } finally {
      setSubmittingPaid(false)
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

  async function postUpdate() {
    if (!myStation || !user) return
    setPosting(true)
    try {
      const fs: FuelStatuses = {}
      for (const code of FUEL_CODES) {
        const v = fuelStatuses[code]
        if (v !== 'SKIP') fs[code] = v
      }

      const { error } = await supabase.functions.invoke('submit-report', {
        body: {
          station_id: myStation.id,
          fuel_statuses: fs,
          queue_bucket: queue,
          reporter_role: 'VERIFIED_STATION',
          user_id: user.id,
        },
      })

      setPostResult(error ? 'error' : 'success')
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
          <Button onClick={() => navigate('/auth')}>{t('auth.signIn')}</Button>
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
      <div className="border-b border-gray-100 bg-white px-4 py-3">
        <h1 className="text-lg font-bold text-gray-900">{t('operator.title')}</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Referrer earnings */}
        <section className="rounded-2xl border border-green-200 bg-green-50 p-4">
          <h2 className="text-sm font-bold text-green-900 mb-2">{t('landing.whatYouEarnTitle')}</h2>
          <p className="text-xs text-green-800 mb-3">{t('landing.whatYouEarnBody')}</p>
          {myReferralCode ? (
            <div className="rounded-xl border border-green-200 bg-white p-3">
              <p className="text-xs text-gray-700 mb-1">{t('landing.getReferralCodeCta')}</p>
              <div className="flex items-center justify-between gap-2">
                <code className="rounded bg-gray-100 px-2 py-1 text-sm font-semibold text-gray-900">{myReferralCode}</code>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    await navigator.clipboard.writeText(myReferralCode)
                  }}
                >
                  <Copy className="h-4 w-4" />
                  Copy
                </Button>
              </div>
              {shareLink ? (
                <div className="mt-2 rounded bg-gray-50 p-2">
                  <p className="text-[11px] text-gray-700 break-all">{shareLink}</p>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="mt-2"
                    onClick={async () => {
                      await navigator.clipboard.writeText(shareLink)
                    }}
                  >
                    <Copy className="h-4 w-4" />
                    Copy share link
                  </Button>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-xs text-gray-700">—</p>
          )}
        </section>

        {/* My referral rewards */}
        {user && (
          <section className="rounded-2xl border border-gray-200 bg-white p-4">
            <h2 className="text-sm font-bold text-gray-900 mb-3">{t('operator.myReferralRewards')}</h2>
            {myReferralRewards.length === 0 ? (
              <p className="text-sm text-gray-700">{t('operator.noReferralRewardsYet')}</p>
            ) : (
              <ul className="space-y-2">
                {myReferralRewards.map((reward) => (
                  <li key={reward.id} className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm">
                    <p className="font-medium text-gray-900">{reward.stations?.name ?? reward.station_id.slice(0, 8)}</p>
                    <p className="text-gray-700">{formatMmk(reward.amount_mmk)}</p>
                    <p className="mt-1 text-xs text-gray-700">
                      {reward.status === 'PENDING' && t('operator.rewardCollectAt', { station: reward.stations?.name ?? reward.station_id.slice(0, 8) })}
                      {reward.status === 'PAID' && t('operator.rewardStatusPaid')}
                      {reward.status === 'COLLECTED' && t('operator.rewardStatusCollected')}
                      {(reward.status === 'PAID' || reward.status === 'COLLECTED') && reward.paid_at && ` · ${new Date(reward.paid_at).toLocaleDateString()}`}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* Tiers */}
        <section className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
          <h2 className="text-sm font-bold text-gray-900 mb-3">{t('operator.tiersTitle')}</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {SUBSCRIPTION_TIERS.map((cfg) => (
              <button
                key={cfg.key}
                type="button"
                onClick={() => setTier(cfg.key)}
                className={`rounded-xl border p-3 text-left ${
                  tier === cfg.key ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white'
                }`}
              >
                <p className="font-semibold text-gray-900">{cfg.name[lang]}</p>
                <p className="mt-1 text-xs text-gray-700">{cfg.description[lang]}</p>
                <p className="mt-2 text-sm font-bold text-gray-900">{formatMmk(cfg.annualPriceMmk)} / {t('landing.perYear')}</p>
              </button>
            ))}
          </div>
          {selectedTierPrice ? (
            <p className="mt-3 text-xs text-gray-700">
              {t('operator.selectTier')} · {formatMmk(selectedTierPrice)} / {t('landing.perYear')} · 15% referral: {formatMmk(selectedReferralAmount)}
            </p>
          ) : null}
          <p className="mt-4 text-sm font-medium text-gray-800">{t('operator.whatYouGetTitle')}</p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-gray-700">
            <li>{t('operator.whatYouGetReliability')}</li>
            <li>{t('operator.whatYouGetUptime')}</li>
            <li>{t('operator.whatYouGetCompare')}</li>
          </ul>
        </section>

        {/* No station yet: Register (owner-first) or Claim existing */}
        {!myStation && (
          <>
            <div className="rounded-2xl bg-white border border-gray-200 p-5">
              <Store className="mb-2 h-8 w-8 text-blue-500" />
              <h2 className="font-semibold text-gray-900">{t('operator.registerTitle')}</h2>
              <p className="mt-1 text-sm text-gray-700">{t('operator.registerIntro')}</p>
              <form onSubmit={submitRegistration} className="mt-4 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    {t('operator.registerFormName')} *
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
                    {t('operator.registerFormAddress')}
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
                      {t('operator.registerFormTownship')}
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
                      {t('operator.registerFormCity')}
                    </label>
                    <input
                      type="text"
                      value={registerForm.city}
                      onChange={(e) => setRegisterForm((f) => ({ ...f, city: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
                {registerResult === 'success' && (
                  <p className="text-sm text-green-600">{t('operator.registerSuccess')}</p>
                )}
                {registerResult === 'error' && (
                  <p className="text-sm text-red-600">{t('operator.registerError')}</p>
                )}
                <Button type="submit" size="lg" className="w-full" loading={registering}>
                  {t('operator.registerSubmit')}
                </Button>
              </form>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm font-semibold text-gray-800">{t('operator.claimExistingTitle')}</p>
              <p className="mt-0.5 text-xs text-gray-700">{t('operator.claimExistingDesc')}</p>
              <Button
                variant="secondary"
                size="md"
                className="mt-3"
                onClick={() => navigate('/home')}
              >
                <MapPin className="h-4 w-4" />
                {t('operator.claimButton')}
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
                {myStation.is_verified ? ` · ${t('station.verified')}` : ` · ${t('operator.pendingVerification')}`}
              </p>
                {myStation.registration_reject_reason ? (
                <p className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-700">
                  {t('operator.registrationRejectedReason')}: {myStation.registration_reject_reason}
                </p>
              ) : null}
            </div>

            {!myStation.is_verified && (
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                <h3 className="font-semibold text-blue-900">{t('operator.completeVerification')}</h3>
                <p className="mt-1 text-xs text-blue-800">{t('operator.paymentInstructions')}</p>

                <div className="mt-3">
                  <label className="mb-1 block text-xs font-semibold text-gray-700">{t('operator.referralCode')}</label>
                  <input
                    value={referralCodeInput === 'ASSIGNED' ? '' : referralCodeInput}
                    onChange={(e) => setReferralCodeInput(e.target.value)}
                    placeholder={t('operator.referralCodePlaceholder')}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
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

                {paymentInstructions ? (
                  <div className="mt-3 rounded-xl border border-gray-200 bg-white p-3 text-xs text-gray-700">
                    {paymentInstructions}
                  </div>
                ) : (
                  <div className="mt-3 rounded-xl border border-gray-200 bg-white p-3 text-xs text-gray-700">
                    Contact us for payment details.
                  </div>
                )}

                {paymentQrUrl ? (
                  <img src={paymentQrUrl} alt="Payment QR" className="mt-3 h-40 w-40 rounded border border-gray-200 object-cover" />
                ) : null}

                {(paymentPhoneWavePay || paymentPhoneKpay) ? (
                  <div className="mt-3 rounded-xl border border-gray-200 bg-white p-3 text-sm text-gray-700">
                    <p className="font-medium text-gray-900">{t('operator.payVia')}</p>
                    {paymentPhoneWavePay ? (
                      <p className="mt-1">WavePay: <a href={`tel:${paymentPhoneWavePay.replace(/\s/g, '')}`} className="font-semibold text-blue-600 underline">{paymentPhoneWavePay}</a></p>
                    ) : null}
                    {paymentPhoneKpay ? (
                      <p className="mt-1">KPay / KBZ Pay: <a href={`tel:${paymentPhoneKpay.replace(/\s/g, '')}`} className="font-semibold text-blue-600 underline">{paymentPhoneKpay}</a></p>
                    ) : null}
                  </div>
                ) : null}

                {myStation.payment_reported_at ? (
                  <p className="mt-3 text-xs text-gray-700">
                    {t('operator.paymentReportedAt')}: {new Date(myStation.payment_reported_at).toLocaleString()}
                  </p>
                ) : null}

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={saveState === 'saving' || uploading}
                    onClick={() => void saveVerificationInfo()}
                    disabled={uploading}
                  >
                    <Upload className="h-4 w-4" />
                    {t('operator.completeVerification')}
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    loading={submittingPaid}
                    onClick={() => void markIHavePaid()}
                    disabled={stationPhotos.length === 0 || !locationPhoto || !!myStation.payment_reported_at}
                  >
                    {t('operator.iHavePaid')}
                  </Button>
                </div>

                {saveMessage ? <p className="mt-3 text-sm text-gray-700">{saveMessage}</p> : null}
              </div>
            )}

            {currentStatus && (
              <div className="rounded-2xl border border-gray-200 bg-white p-4">
                <p className="font-semibold text-gray-900">{t('operator.currentStatus')}</p>
                <p className="mt-1 text-xs text-gray-700">{t('operator.updateFuelStatusDescription')}</p>
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

            {myStation.is_verified && (
              <div className="rounded-2xl border border-gray-200 bg-white p-4">
                <p className="font-semibold text-gray-900">{t('operator.yourStationReliability')}</p>
                <p className="mt-1 text-xs text-gray-700">{t('operator.reliabilityDescription')}</p>
                {reliability ? (
                  <div className="mt-3 space-y-2 text-sm">
                    <p className="text-gray-700">
                      {t('operator.reportsLast7d')}: <strong>{reliability.reports_last_7d}</strong>
                      {reliability.verified_last_7d > 0 && (
                        <span className="ml-2 text-gray-700">({t('operator.verifiedUpdates')}: {reliability.verified_last_7d})</span>
                      )}
                    </p>
                    <p className="text-gray-700">
                      {t('operator.reportsLast30d')}: <strong>{reliability.reports_last_30d}</strong>
                      {reliability.verified_last_30d > 0 && (
                        <span className="ml-2 text-gray-700">({t('operator.verifiedUpdates')}: {reliability.verified_last_30d})</span>
                      )}
                    </p>
                    {reliability.last_updated_at && (
                      <p className="text-xs text-gray-700">{t('operator.lastUpdated')}: {formatRelativeTime(reliability.last_updated_at)}</p>
                    )}
                    {reliability.city_name != null && reliability.city_stations_count != null && reliability.city_avg_reports_7d != null && (
                      <p className="text-xs text-gray-700 mt-2">
                        {t('operator.vsCity', {
                          city: reliability.city_name,
                          count: reliability.city_stations_count,
                          avg7: reliability.city_avg_reports_7d,
                          avg30: reliability.city_avg_reports_30d ?? '—',
                        })}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-gray-700">{t('operator.reliabilityNoData')}</p>
                )}
              </div>
            )}

            {myStation.is_verified && (
              <div className="rounded-2xl border border-gray-200 bg-white p-4">
                <p className="font-semibold text-gray-900">{t('operator.uptime30d')}</p>
                <p className="mt-1 text-xs text-gray-700">{t('operator.uptimeDescription')}</p>
                {uptime?.has_sufficient_data && uptime.uptime_pct != null ? (
                  <p className="mt-3 text-sm text-gray-700">
                    {t('operator.uptimeValue', { pct: uptime.uptime_pct })}
                  </p>
                ) : (
                  <p className="mt-3 text-sm text-gray-700">{t('operator.uptimeCollectingData')}</p>
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
                <p className="text-xs text-gray-700">{t('operator.followers')}</p>
                <p className="text-lg font-bold text-gray-800">—</p>
              </div>
              <div className="rounded-xl bg-white border border-gray-100 p-3 text-center">
                <Send className="mx-auto h-5 w-5 text-gray-700 mb-1" />
                <p className="text-xs text-gray-700">{t('operator.confirmations')}</p>
                <p className="text-lg font-bold text-gray-800">—</p>
              </div>
            </div>

            {/* Post update — only when verified */}
            <div className="rounded-2xl bg-white border border-gray-200 p-4">
              <p className="font-semibold text-gray-800 mb-1">{t('operator.postUpdate')}</p>
              {!myStation.is_verified ? (
                <p className="text-sm text-amber-700 mb-3">{t('operator.postAfterApproval')}</p>
              ) : (
                <>
                  <p className="text-xs text-gray-700 mb-3">{t('operator.postUpdateHint')}</p>

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
              {postResult === 'error' && (
                <p className="mt-3 text-sm text-red-600">{t('report.error')}</p>
              )}

              <Button
                variant="primary"
                size="lg"
                className="mt-4 w-full"
                loading={posting}
                disabled={!myStation.is_verified}
                onClick={() => void postUpdate()}
              >
                <Send className="h-4 w-4" />
                {t('operator.postUpdate')}
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
