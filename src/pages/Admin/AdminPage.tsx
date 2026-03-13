import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Flag, Store, ShieldAlert, CreditCard, Camera, Settings, Trophy, Lightbulb, MapPin, Wifi } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { SUBSCRIPTION_TIERS, formatMmk, getTierPrice } from '@/lib/subscriptionTiers'
import type { StationStatusReport, StationClaim, Station, SubscriptionTierRequested } from '@/types'

type Tab = 'flagged' | 'registrations' | 'claims' | 'referrals' | 'payment' | 'rewards' | 'suggestions' | 'b2b'

interface StationSuggestion {
  id: string
  name: string
  city: string | null
  address: string | null
  lat: number | null
  lng: number | null
  note: string | null
  suggested_by: string | null
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
}

interface ReporterRow {
  user_id: string
  display_name: string | null
  report_count: number
  rank: number
}
type PaymentMethod = 'KBZ_PAY' | 'WAVEPAY' | 'BANK_TRANSFER'

interface PendingReferralRewardRow {
  id: string
  station_id: string
  amount_mmk: number
  status: string
  created_at: string
  stations: { name: string } | null
}

interface PendingB2BRow {
  id: string
  user_id: string
  plan_type: string
  valid_until: string
  payment_method: string | null
  payment_reference: string | null
  screenshot_path: string | null
  created_at: string
}

function fairShuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = a[i]; a[i] = a[j]; a[j] = tmp
  }
  return a
}

export function AdminPage() {
  const { t } = useTranslation()
  const { isAdmin } = useAuthStore()
  const [tab, setTab] = useState<Tab>('registrations')
  const [flagged, setFlagged] = useState<StationStatusReport[]>([])
  const [claims, setClaims] = useState<StationClaim[]>([])
  const [registrations, setRegistrations] = useState<Station[]>([])
  const [pendingReferrals, setPendingReferrals] = useState<PendingReferralRewardRow[]>([])
  const [suggestions, setSuggestions] = useState<StationSuggestion[]>([])
  const [pendingB2B, setPendingB2B] = useState<PendingB2BRow[]>([])
  const [loading, setLoading] = useState(true)
  const [workingId, setWorkingId] = useState<string | null>(null)
  const [rejectingStation, setRejectingStation] = useState<Station | null>(null)
  const [rejectReasonInput, setRejectReasonInput] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('KBZ_PAY')
  const [paymentReference, setPaymentReference] = useState('')
  const [referralPaymentMethod, setReferralPaymentMethod] = useState<PaymentMethod>('WAVEPAY')
  const [referralPaymentRef, setReferralPaymentRef] = useState('')
  const [referralPayStationId, setReferralPayStationId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [paymentConfig, setPaymentConfig] = useState<{
    payment_instructions: string
    payment_qr_url: string
    payment_phone_wavepay: string
    payment_phone_kpay: string
  }>({
    payment_instructions: '',
    payment_qr_url: '',
    payment_phone_wavepay: '',
    payment_phone_kpay: '',
  })
  const [paymentConfigLoading, setPaymentConfigLoading] = useState(false)
  const [paymentConfigSaving, setPaymentConfigSaving] = useState(false)
  const [paymentConfigSaved, setPaymentConfigSaved] = useState(false)

  // Rewards tab state
  const [rewardsPeriodDays, setRewardsPeriodDays] = useState(30)
  const [rewardsMinReports, setRewardsMinReports] = useState(5)
  const [rewardsDrawCount, setRewardsDrawCount] = useState(3)
  const [reporters, setReporters] = useState<ReporterRow[]>([])
  const [rewardsLoading, setRewardsLoading] = useState(false)
  const [drawResult, setDrawResult] = useState<ReporterRow[] | null>(null)
  const [rewardsRecorded, setRewardsRecorded] = useState(false)
  const [rewardsRecording, setRewardsRecording] = useState(false)

  useEffect(() => {
    void loadAll()
  }, [])

  useEffect(() => {
    if (tab !== 'payment') return
    setPaymentConfigLoading(true)
    void (async () => {
      try {
        const { data } = await supabase
          .from('payment_config')
          .select('payment_instructions, payment_qr_url, payment_phone_wavepay, payment_phone_kpay')
          .eq('id', 'default')
          .maybeSingle()
        const row = data as { payment_instructions?: string | null; payment_qr_url?: string | null; payment_phone_wavepay?: string | null; payment_phone_kpay?: string | null } | null
        setPaymentConfig({
          payment_instructions: row?.payment_instructions?.trim() ?? '',
          payment_qr_url: row?.payment_qr_url?.trim() ?? '',
          payment_phone_wavepay: row?.payment_phone_wavepay?.trim() ?? '',
          payment_phone_kpay: row?.payment_phone_kpay?.trim() ?? '',
        })
      } finally {
        setPaymentConfigLoading(false)
      }
    })()
  }, [tab])

  useEffect(() => {
    if (tab !== 'rewards') return
    void loadReporters()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, rewardsPeriodDays])

  async function loadReporters() {
    setRewardsLoading(true)
    setDrawResult(null)
    setRewardsRecorded(false)
    const { data } = await supabase.rpc('get_top_reporters', {
      period_days: rewardsPeriodDays,
      result_limit: 100,
    })
    setReporters((data ?? []) as ReporterRow[])
    setRewardsLoading(false)
  }

  function runDraw() {
    const eligible = reporters.filter(
      (r) => Number(r.rank) > 1 && Number(r.report_count) >= rewardsMinReports,
    )
    if (eligible.length === 0) { setDrawResult([]); return }
    setDrawResult(fairShuffle(eligible).slice(0, rewardsDrawCount))
    setRewardsRecorded(false)
  }

  async function recordWinners() {
    if (!drawResult) return
    const periodLabel = new Date().toISOString().slice(0, 7)
    setRewardsRecording(true)
    const topPerformer = reporters.find((r) => Number(r.rank) === 1)

    const rows = [
      ...(topPerformer
        ? [{
            period_label: periodLabel,
            user_id: topPerformer.user_id,
            reward_type: 'TOP_PERFORMER',
            report_count: Number(topPerformer.report_count),
            rank: 1,
          }]
        : []),
      ...drawResult.map((r) => ({
        period_label: periodLabel,
        user_id: r.user_id,
        reward_type: 'LUCKY_DRAW',
        report_count: Number(r.report_count),
        rank: Number(r.rank),
      })),
    ]

    const { error: insertErr } = await supabase.from('reward_events').insert(rows)
    setRewardsRecording(false)
    if (insertErr) {
      setError(insertErr.message)
      return
    }
    setRewardsRecorded(true)
  }

  async function savePaymentConfig() {
    setPaymentConfigSaving(true)
    setPaymentConfigSaved(false)
    const { error: updateErr } = await supabase
      .from('payment_config')
      .update({
        payment_instructions: paymentConfig.payment_instructions.trim() || null,
        payment_qr_url: paymentConfig.payment_qr_url.trim() || null,
        payment_phone_wavepay: paymentConfig.payment_phone_wavepay.trim() || null,
        payment_phone_kpay: paymentConfig.payment_phone_kpay.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 'default')
    setPaymentConfigSaving(false)
    if (updateErr) {
      setError(updateErr.message)
      return
    }
    setPaymentConfigSaved(true)
    setError(null)
  }

  async function loadAll() {
    setLoading(true)
    setError(null)
    const [flaggedRes, claimsRes, registrationsRes, pendingRefRes, suggestionsRes, b2bRes] = await Promise.all([
      supabase
        .from('station_status_reports')
        .select('*')
        .eq('is_flagged', true)
        .order('reported_at', { ascending: false }),
      supabase
        .from('station_claims')
        .select('*')
        .eq('status', 'PENDING')
        .order('submitted_at', { ascending: false }),
      supabase
        .from('stations')
        .select('*')
        .not('verified_owner_id', 'is', null)
        .eq('is_verified', false)
        .is('registration_rejected_at', null)
        .order('created_at', { ascending: false }),
      supabase
        .from('referral_rewards')
        .select('id, station_id, amount_mmk, status, created_at, stations(name)')
        .eq('status', 'PENDING')
        .order('created_at', { ascending: false }),
      supabase
        .from('station_suggestions')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false }),
      supabase
        .from('b2b_subscriptions')
        .select('id, user_id, plan_type, valid_until, payment_method, payment_reference, screenshot_path, created_at')
        .eq('status', 'PENDING')
        .order('created_at', { ascending: false }),
    ])
    setFlagged(flaggedRes.data ?? [])
    setClaims(claimsRes.data ?? [])
    setRegistrations((registrationsRes.data ?? []) as Station[])
    setPendingReferrals((pendingRefRes.data ?? []) as unknown as PendingReferralRewardRow[])
    setSuggestions((suggestionsRes.data ?? []) as StationSuggestion[])
    setPendingB2B((b2bRes.data ?? []) as PendingB2BRow[])
    setLoading(false)
  }

  async function confirmB2B(subscriptionId: string, action: 'confirm' | 'reject') {
    setWorkingId(subscriptionId)
    setError(null)
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('admin-confirm-b2b', {
        body: { subscription_id: subscriptionId, action },
      })
      if (fnErr) throw fnErr
      if (data?.error) throw new Error(data.error)
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'))
    } finally {
      setWorkingId(null)
    }
  }

  async function dismissReport(id: string) {
    await supabase
      .from('station_status_reports')
      .update({ is_flagged: false })
      .eq('id', id)
    setFlagged((prev) => prev.filter((r) => r.id !== id))
  }

  async function deleteReport(id: string) {
    await supabase.from('station_status_reports').delete().eq('id', id)
    setFlagged((prev) => prev.filter((r) => r.id !== id))
  }

  async function approveClaim(id: string) {
    setWorkingId(id)
    const claim = claims.find((c) => c.id === id)
    if (!claim) {
      setWorkingId(null)
      return
    }
    // Assign ownership only; station must complete tier/photos/payment and admin approves via Pending registrations
    await supabase
      .from('stations')
      .update({ verified_owner_id: claim.user_id })
      .eq('id', claim.station_id)
    await supabase
      .from('station_claims')
      .update({ status: 'APPROVED', reviewed_at: new Date().toISOString() })
      .eq('id', id)
    setClaims((prev) => prev.filter((c) => c.id !== id))
    await loadAll()
    setWorkingId(null)
  }

  async function rejectClaim(id: string) {
    setWorkingId(id)
    await supabase
      .from('station_claims')
      .update({ status: 'REJECTED', reviewed_at: new Date().toISOString() })
      .eq('id', id)
    setClaims((prev) => prev.filter((c) => c.id !== id))
    setWorkingId(null)
  }

  async function markPayment(stationId: string) {
    setWorkingId(stationId)
    setError(null)
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('admin-mark-payment', {
        body: {
          station_id: stationId,
          payment_method: paymentMethod,
          payment_reference: paymentReference.trim() || null,
        },
      })
      if (fnErr) throw fnErr
      if (data?.error) throw new Error(data.error)
      setPaymentReference('')
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'))
    } finally {
      setWorkingId(null)
    }
  }

  async function approveRegistration(stationId: string) {
    setWorkingId(stationId)
    setError(null)
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('admin-approve-registration', {
        body: { station_id: stationId },
      })
      if (fnErr) throw fnErr
      if (data?.error) throw new Error(data.error)
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'))
    } finally {
      setWorkingId(null)
    }
  }

  async function markReferralCollected(stationId: string) {
    setWorkingId(stationId)
    setError(null)
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('admin-mark-referral-collected', {
        body: { station_id: stationId },
      })
      if (fnErr) throw fnErr
      if (data?.error) throw new Error(data.error)
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'))
    } finally {
      setWorkingId(null)
    }
  }

  async function markReferralPaid(stationId: string) {
    setWorkingId(stationId)
    setError(null)
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('admin-mark-referral-paid', {
        body: {
          station_id: stationId,
          payment_method: referralPaymentMethod,
          payment_reference: referralPaymentRef.trim() || undefined,
        },
      })
      if (fnErr) throw fnErr
      if (data?.error) throw new Error(data.error)
      setReferralPayStationId(null)
      setReferralPaymentRef('')
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'))
    } finally {
      setWorkingId(null)
    }
  }

  async function confirmRejectRegistration(station: Station) {
    const reason = rejectReasonInput.trim() || t('admin.tierUnderDeclaredReject')
    setWorkingId(station.id)
    setError(null)
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('admin-reject-registration', {
        body: { station_id: station.id, reason },
      })
      if (fnErr) throw fnErr
      if (data?.error) throw new Error(data.error)
      setRejectingStation(null)
      setRejectReasonInput('')
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'))
    } finally {
      setWorkingId(null)
    }
  }

  async function approveSuggestion(id: string) {
    setWorkingId(id)
    setError(null)
    try {
      const { error: updateErr } = await supabase
        .from('station_suggestions')
        .update({ status: 'approved' })
        .eq('id', id)
      if (updateErr) throw updateErr
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'))
    } finally {
      setWorkingId(null)
    }
  }

  async function rejectSuggestion(id: string) {
    setWorkingId(id)
    setError(null)
    try {
      const { error: updateErr } = await supabase
        .from('station_suggestions')
        .update({ status: 'rejected' })
        .eq('id', id)
      if (updateErr) throw updateErr
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'))
    } finally {
      setWorkingId(null)
    }
  }

  if (!isAdmin) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <div>
          <ShieldAlert className="mx-auto mb-3 h-12 w-12 text-gray-700" />
          <p className="text-gray-700">Admin access required.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-100 bg-white px-4 py-3">
        <h1 className="text-lg font-bold text-gray-900">{t('admin.title')}</h1>
        <p className="mt-1 text-xs text-gray-700">
          {t('admin.registrationQueueSummary', { registrations: registrations.length, claims: claims.length, suggestions: suggestions.length })}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100 bg-white">
        <button
          onClick={() => setTab('registrations')}
          className={`flex flex-1 items-center justify-center gap-1.5 py-3 text-sm font-medium transition-all ${tab === 'registrations' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-700'}`}
        >
          <CreditCard className="h-4 w-4" />
          {t('admin.pendingRegistrations')}
          {registrations.length > 0 && (
            <span className="rounded-full bg-blue-500 px-1.5 py-0.5 text-xs text-white">
              {registrations.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('flagged')}
          className={`flex flex-1 items-center justify-center gap-1.5 py-3 text-sm font-medium transition-all ${tab === 'flagged' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-700'}`}
        >
          <Flag className="h-4 w-4" />
          {t('admin.flaggedReports')}
          {flagged.length > 0 && (
            <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-xs text-white">
              {flagged.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('claims')}
          className={`flex flex-1 items-center justify-center gap-1.5 py-3 text-sm font-medium transition-all ${tab === 'claims' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-700'}`}
        >
          <Store className="h-4 w-4" />
          {t('admin.stationClaims')}
          {claims.length > 0 && (
            <span className="rounded-full bg-orange-500 px-1.5 py-0.5 text-xs text-white">
              {claims.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('referrals')}
          className={`flex flex-1 items-center justify-center gap-1.5 py-3 text-sm font-medium transition-all ${tab === 'referrals' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-700'}`}
        >
          <CreditCard className="h-4 w-4" />
          {t('admin.referralPayouts')}
          {pendingReferrals.length > 0 && (
            <span className="rounded-full bg-green-600 px-1.5 py-0.5 text-xs text-white">
              {pendingReferrals.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('suggestions')}
          className={`flex flex-1 items-center justify-center gap-1.5 py-3 text-sm font-medium transition-all ${tab === 'suggestions' ? 'border-b-2 border-amber-500 text-amber-600' : 'text-gray-700'}`}
        >
          <Lightbulb className="h-4 w-4" />
          {t('admin.suggestionsTab')}
          {suggestions.length > 0 && (
            <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-xs text-white">
              {suggestions.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('payment')}
          className={`flex flex-1 items-center justify-center gap-1.5 py-3 text-sm font-medium transition-all ${tab === 'payment' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-700'}`}
        >
          <Settings className="h-4 w-4" />
          {t('admin.paymentSettings')}
        </button>
        <button
          onClick={() => setTab('rewards')}
          className={`flex flex-1 items-center justify-center gap-1.5 py-3 text-sm font-medium transition-all ${tab === 'rewards' ? 'border-b-2 border-amber-500 text-amber-600' : 'text-gray-700'}`}
        >
          <Trophy className="h-4 w-4" />
          {t('admin.rewardsTab')}
        </button>
        <button
          onClick={() => setTab('b2b')}
          className={`flex flex-1 items-center justify-center gap-1.5 py-3 text-sm font-medium transition-all ${tab === 'b2b' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-700'}`}
        >
          <Wifi className="h-4 w-4" />
          B2B
          {pendingB2B.length > 0 && (
            <span className="rounded-full bg-blue-500 px-1.5 py-0.5 text-xs text-white">
              {pendingB2B.length}
            </span>
          )}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {error && <p className="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : tab === 'registrations' ? (
          registrations.length === 0 ? (
            <p className="py-12 text-center text-gray-700">No pending registrations.</p>
          ) : (
            <div className="space-y-3">
              {registrations.map((station) => {
                const tier = (station.subscription_tier_requested ?? 'small') as SubscriptionTierRequested
                const amount = getTierPrice(tier)
                const tierCfg = SUBSCRIPTION_TIERS.find((item) => item.key === tier)
                return (
                  <div key={station.id} className="rounded-xl border border-gray-200 bg-white p-4">
                    <p className="text-sm font-semibold text-gray-900">{station.name}</p>
                    <p className="text-xs text-gray-700">{station.township}, {station.city}</p>
                    <p className="mt-1 text-xs text-gray-700">
                      {t('admin.requestedTier')}: <span className="font-semibold">{tierCfg?.name.en ?? tier}</span>
                      {amount ? ` · ${t('admin.expectedAmount')}: ${formatMmk(amount)} / year` : ''}
                    </p>
                    <p className="text-xs text-gray-700">
                      Owner: {station.verified_owner_id?.slice(0, 8)}… · {new Date(station.created_at).toLocaleDateString()}
                    </p>
                    {station.payment_reported_at && (
                      <p className="mt-1 text-xs text-green-700 font-medium">
                        {t('admin.paymentReportedAt')}: {new Date(station.payment_reported_at).toLocaleString()}
                      </p>
                    )}

                    <div className="mt-3">
                      <p className="mb-1 text-xs font-medium text-gray-700">{t('admin.stationPhotos')}</p>
                      <div className="flex flex-wrap gap-2">
                        {(station.station_photo_urls ?? []).map((url) => (
                          <a key={url} href={url} target="_blank" rel="noreferrer">
                            <img src={url} alt="Station" className="h-16 w-16 rounded border border-gray-200 object-cover" />
                          </a>
                        ))}
                        {(station.station_photo_urls ?? []).length === 0 && (
                          <p className="text-xs text-amber-700">No station photos uploaded.</p>
                        )}
                      </div>
                    </div>
                    <div className="mt-2">
                      <p className="mb-1 text-xs font-medium text-gray-700">{t('admin.locationPhoto')}</p>
                      {station.location_photo_url ? (
                        <a href={station.location_photo_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 underline">
                          <Camera className="h-3.5 w-3.5" />
                          View location photo
                        </a>
                      ) : (
                        <p className="text-xs text-amber-700">No location photo uploaded.</p>
                      )}
                    </div>

                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                        className="rounded-lg border border-gray-300 px-2 py-2 text-sm text-gray-900"
                      >
                        <option value="KBZ_PAY">KBZ Pay</option>
                        <option value="WAVEPAY">WavePay</option>
                        <option value="BANK_TRANSFER">Bank transfer</option>
                      </select>
                      <input
                        value={paymentReference}
                        onChange={(e) => setPaymentReference(e.target.value)}
                        placeholder={t('admin.paymentReference')}
                        className="rounded-lg border border-gray-300 px-2 py-2 text-sm text-gray-900"
                      />
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={workingId === station.id}
                        onClick={() => void markPayment(station.id)}
                      >
                        {t('admin.markPaymentReceived')}
                      </Button>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="primary"
                        loading={workingId === station.id}
                        disabled={!station.payment_received_at}
                        onClick={() => void approveRegistration(station.id)}
                      >
                        {t('admin.approve')}
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => { setRejectingStation(station); setRejectReasonInput(t('admin.tierUnderDeclaredReject')) }}
                      >
                        {t('admin.reject')}
                      </Button>
                    </div>
                    {rejectingStation?.id === station.id && (
                      <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3">
                        <p className="mb-2 text-xs font-semibold text-red-800">{t('admin.rejectReason')}</p>
                        <textarea
                          value={rejectReasonInput}
                          onChange={(e) => setRejectReasonInput(e.target.value)}
                          rows={2}
                          className="w-full rounded-lg border border-red-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-red-400"
                        />
                        <div className="mt-2 flex gap-2">
                          <Button
                            size="sm"
                            variant="danger"
                            loading={workingId === station.id}
                            onClick={() => void confirmRejectRegistration(station)}
                          >
                            {t('admin.confirmReject')}
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => { setRejectingStation(null); setRejectReasonInput('') }}>
                            {t('admin.cancel')}
                          </Button>
                        </div>
                      </div>
                    )}
                    {!station.payment_received_at && (
                      <p className="mt-2 text-xs text-amber-700">Payment not marked yet. Approve is disabled.</p>
                    )}
                  </div>
                )
              })}
            </div>
          )
        ) : tab === 'payment' ? (
          paymentConfigLoading ? (
            <div className="flex justify-center py-12">
              <Spinner />
            </div>
          ) : (
            <div className="mx-auto max-w-lg space-y-4">
              <p className="text-sm text-gray-700">{t('admin.paymentSettingsIntro')}</p>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">{t('admin.paymentInstructionsLabel')}</label>
                <textarea
                  value={paymentConfig.payment_instructions}
                  onChange={(e) => setPaymentConfig((c) => ({ ...c, payment_instructions: e.target.value }))}
                  placeholder={t('admin.paymentInstructionsPlaceholder')}
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">{t('admin.paymentQrUrlLabel')}</label>
                <input
                  type="url"
                  value={paymentConfig.payment_qr_url}
                  onChange={(e) => setPaymentConfig((c) => ({ ...c, payment_qr_url: e.target.value }))}
                  placeholder={t('admin.paymentQrUrlPlaceholder')}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">{t('admin.paymentPhoneWavePayLabel')}</label>
                <input
                  type="text"
                  value={paymentConfig.payment_phone_wavepay}
                  onChange={(e) => setPaymentConfig((c) => ({ ...c, payment_phone_wavepay: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">{t('admin.paymentPhoneKpayLabel')}</label>
                <input
                  type="text"
                  value={paymentConfig.payment_phone_kpay}
                  onChange={(e) => setPaymentConfig((c) => ({ ...c, payment_phone_kpay: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                />
              </div>
              <Button
                variant="primary"
                loading={paymentConfigSaving}
                onClick={() => void savePaymentConfig()}
              >
                {paymentConfigSaved ? t('admin.paymentSettingsSaved') : t('admin.savePaymentSettings')}
              </Button>
            </div>
          )
        ) : tab === 'referrals' ? (
          pendingReferrals.length === 0 ? (
            <p className="py-12 text-center text-gray-700">{t('admin.noPendingReferrals')}</p>
          ) : (
            <div className="space-y-3">
              {pendingReferrals.map((reward) => (
                <div key={reward.id} className="rounded-xl border border-gray-200 bg-white p-4">
                  <p className="text-sm font-semibold text-gray-900">
                    {reward.stations?.name ?? reward.station_id.slice(0, 8)}
                  </p>
                  <p className="text-xs text-gray-700">
                    {t('admin.referralAmount')}: {reward.amount_mmk.toLocaleString('en-US')} MMK
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={workingId === reward.station_id}
                      onClick={() => void markReferralCollected(reward.station_id)}
                    >
                      {t('admin.markCollected')}
                    </Button>
                    <Button
                      size="sm"
                      variant="primary"
                      loading={referralPayStationId === reward.station_id && workingId === reward.station_id}
                      onClick={() => setReferralPayStationId(reward.station_id)}
                    >
                      {t('admin.markPaid')}
                    </Button>
                  </div>
                  {referralPayStationId === reward.station_id && (
                    <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <select
                        value={referralPaymentMethod}
                        onChange={(e) => setReferralPaymentMethod(e.target.value as PaymentMethod)}
                        className="rounded-lg border border-gray-300 px-2 py-2 text-sm text-gray-900"
                      >
                        <option value="WAVEPAY">WavePay</option>
                        <option value="KBZ_PAY">KBZ Pay</option>
                        <option value="BANK_TRANSFER">Bank transfer</option>
                      </select>
                      <input
                        value={referralPaymentRef}
                        onChange={(e) => setReferralPaymentRef(e.target.value)}
                        placeholder={t('admin.paymentReference')}
                        className="rounded-lg border border-gray-300 px-2 py-2 text-sm text-gray-900"
                      />
                      <Button
                        size="sm"
                        loading={workingId === reward.station_id}
                        onClick={() => void markReferralPaid(reward.station_id)}
                        disabled={workingId === reward.station_id}
                      >
                        {t('admin.confirmPaid')}
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => { setReferralPayStationId(null); setReferralPaymentRef('') }}>
                        {t('admin.cancel')}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        ) : tab === 'rewards' ? (
          <div className="space-y-5">
            <h2 className="text-base font-bold text-gray-900">{t('admin.rewardsTitle')}</h2>

            {/* Controls */}
            <div className="flex flex-wrap gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-700">{t('admin.rewardsPeriodLabel')}</label>
                <select
                  value={rewardsPeriodDays}
                  onChange={(e) => setRewardsPeriodDays(Number(e.target.value))}
                  className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
                >
                  <option value={30}>30 days</option>
                  <option value={31}>31 days</option>
                  <option value={28}>28 days</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-700">{t('admin.rewardsMinReports')}</label>
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={rewardsMinReports}
                  onChange={(e) => setRewardsMinReports(Number(e.target.value))}
                  className="w-20 rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-700">{t('admin.rewardsDrawCount')}</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={rewardsDrawCount}
                  onChange={(e) => setRewardsDrawCount(Number(e.target.value))}
                  className="w-20 rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
                />
              </div>
              <div className="flex items-end">
                <Button size="sm" variant="secondary" loading={rewardsLoading} onClick={() => void loadReporters()}>
                  Refresh
                </Button>
              </div>
            </div>

            <p className="text-xs text-gray-700">{t('admin.rewardsPeriodNote', { days: rewardsPeriodDays })}</p>

            {rewardsLoading ? (
              <div className="flex justify-center py-8"><Spinner /></div>
            ) : reporters.length === 0 ? (
              <p className="py-8 text-center text-gray-700">{t('admin.rewardsNoReporters')}</p>
            ) : (
              <>
                {/* Leaderboard */}
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-gray-800">{t('admin.rewardsLeaderboardTitle')}</h3>
                  <ol className="space-y-1.5">
                    {reporters.map((r) => (
                      <li
                        key={r.user_id}
                        className={[
                          'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm',
                          Number(r.rank) === 1
                            ? 'border-amber-300 bg-amber-50'
                            : 'border-gray-200 bg-white',
                        ].join(' ')}
                      >
                        <span className="w-7 text-center font-bold text-gray-700">#{r.rank}</span>
                        <span className="flex-1 text-gray-900">
                          {r.display_name ?? r.user_id.slice(0, 12) + '…'}
                        </span>
                        <span className="text-gray-700">{r.report_count} reports</span>
                        {Number(r.rank) === 1 && (
                          <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">
                            {t('admin.rewardsGuaranteedLabel')}
                          </span>
                        )}
                      </li>
                    ))}
                  </ol>
                </div>

                {/* Draw pool summary */}
                {(() => {
                  const eligible = reporters.filter(
                    (r) => Number(r.rank) > 1 && Number(r.report_count) >= rewardsMinReports,
                  )
                  return (
                    <p className="text-xs text-gray-700">
                      {t('admin.rewardsEligibleCount', { count: eligible.length, min: rewardsMinReports })}
                    </p>
                  )
                })()}

                {/* Run draw */}
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="primary"
                    onClick={runDraw}
                  >
                    <Trophy className="h-4 w-4" />
                    {drawResult === null ? t('admin.rewardsRunDraw') : t('admin.rewardsReRunDraw')}
                  </Button>
                </div>

                {/* Draw result */}
                {drawResult !== null && (
                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                    <h3 className="mb-3 text-sm font-semibold text-blue-800">{t('admin.rewardsDrawResultTitle')}</h3>
                    {drawResult.length === 0 ? (
                      <p className="text-sm text-gray-700">No eligible reporters in the pool.</p>
                    ) : (
                      <ol className="mb-4 space-y-1.5">
                        {drawResult.map((r) => (
                          <li key={r.user_id} className="flex items-center gap-2 rounded-lg border border-blue-100 bg-white px-3 py-2 text-sm">
                            <span className="flex-1 text-gray-900">
                              {r.display_name ?? r.user_id.slice(0, 12) + '…'}
                            </span>
                            <span className="text-gray-700">{r.report_count} reports · rank #{r.rank}</span>
                            <span className="rounded-full bg-blue-500 px-2 py-0.5 text-xs font-bold text-white">
                              {t('admin.rewardsDrawLabel')}
                            </span>
                          </li>
                        ))}
                      </ol>
                    )}
                    {rewardsRecorded ? (
                      <p className="text-sm font-semibold text-green-700">{t('admin.rewardsRecorded')}</p>
                    ) : (
                      <Button
                        variant="primary"
                        loading={rewardsRecording}
                        onClick={() => void recordWinners()}
                      >
                        {t('admin.rewardsRecordWinners')}
                      </Button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        ) : tab === 'flagged' ? (
          flagged.length === 0 ? (
            <p className="py-12 text-center text-gray-700">{t('admin.noFlagged')}</p>
          ) : (
            <div className="space-y-3">
              {flagged.map((report) => (
                <div key={report.id} className="rounded-xl border border-gray-200 bg-white p-4">
                  <p className="text-xs text-gray-700 mb-2">
                    Report ID: {report.id.slice(0, 8)}… · {report.reporter_role}
                  </p>
                  <pre className="text-xs bg-gray-50 rounded p-2 overflow-x-auto">
                    {JSON.stringify(report.fuel_statuses, null, 2)}
                  </pre>
                  {report.note && (
                    <p className="mt-2 text-xs italic text-gray-700">"{report.note}"</p>
                  )}
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => void dismissReport(report.id)}>
                      {t('admin.dismiss')}
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => void deleteReport(report.id)}>
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : tab === 'suggestions' ? (
          suggestions.length === 0 ? (
            <p className="py-12 text-center text-gray-700">{t('admin.noSuggestions')}</p>
          ) : (
            <div className="space-y-3">
              {suggestions.map((s) => {
                const mapsQuery = [s.name, s.city, s.address].filter(Boolean).join(' ')
                const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(mapsQuery)}`
                return (
                  <div key={s.id} className="rounded-xl border border-gray-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{s.name}</p>
                        {s.city && (
                          <p className="text-xs text-gray-700">{s.city}{s.address ? ` · ${s.address}` : ''}</p>
                        )}
                        {s.note && (
                          <p className="mt-1 text-xs italic text-gray-600">"{s.note}"</p>
                        )}
                        <p className="mt-1 text-xs text-gray-400">
                          {new Date(s.created_at).toLocaleDateString()}
                          {s.suggested_by ? ` · ${s.suggested_by.slice(0, 8)}…` : ' · anonymous'}
                        </p>
                      </div>
                      <a
                        href={mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 active:scale-95"
                      >
                        <MapPin className="h-3.5 w-3.5" />
                        {t('admin.openInGoogleMaps')}
                      </a>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button
                        size="sm"
                        variant="primary"
                        loading={workingId === s.id}
                        onClick={() => void approveSuggestion(s.id)}
                      >
                        {t('admin.approveSuggestion')}
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        loading={workingId === s.id}
                        onClick={() => void rejectSuggestion(s.id)}
                      >
                        {t('admin.rejectSuggestion')}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        ) : tab === 'b2b' ? (
          pendingB2B.length === 0 ? (
            <p className="py-12 text-center text-gray-700">No pending B2B subscriptions.</p>
          ) : (
            <div className="space-y-3">
              {pendingB2B.map((sub) => (
                <div key={sub.id} className="rounded-xl border border-gray-200 bg-white p-4">
                  <p className="text-sm font-semibold text-gray-900">
                    {sub.plan_type === 'national_view' ? 'National View' : 'Route Access'}
                  </p>
                  <p className="text-xs text-gray-700">User: {sub.user_id.slice(0, 8)}…</p>
                  <p className="text-xs text-gray-700">
                    Valid until: {new Date(sub.valid_until).toLocaleDateString()}
                  </p>
                  {sub.payment_method && (
                    <p className="text-xs text-gray-700">Method: {sub.payment_method}</p>
                  )}
                  {sub.payment_reference && (
                    <p className="text-xs text-gray-700">Reference: {sub.payment_reference}</p>
                  )}
                  {sub.screenshot_path && (
                    <a
                      href={sub.screenshot_path}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs text-blue-600 underline"
                    >
                      <Camera className="h-3.5 w-3.5" />
                      View payment screenshot
                    </a>
                  )}
                  <p className="mt-1 text-xs text-gray-700">
                    Submitted: {new Date(sub.created_at).toLocaleDateString()}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      variant="primary"
                      loading={workingId === sub.id}
                      onClick={() => void confirmB2B(sub.id, 'confirm')}
                    >
                      Confirm Payment
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      loading={workingId === sub.id}
                      onClick={() => void confirmB2B(sub.id, 'reject')}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : claims.length === 0 ? (
          <p className="py-12 text-center text-gray-700">{t('admin.noClaims')}</p>
        ) : (
          <div className="space-y-3">
            {claims.map((claim) => (
              <div key={claim.id} className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="text-xs text-gray-700 mb-1">Station: {claim.station_id.slice(0, 8)}…</p>
                <p className="text-xs text-gray-700">User: {claim.user_id.slice(0, 8)}…</p>
                <p className="text-xs text-gray-700 mt-1">
                  Submitted: {new Date(claim.submitted_at).toLocaleDateString()}
                </p>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="primary" onClick={() => void approveClaim(claim.id)}>
                    {t('admin.approve')}
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => void rejectClaim(claim.id)}>
                    {t('admin.reject')}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
