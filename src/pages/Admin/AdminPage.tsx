import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Flag, Store, ShieldAlert, CreditCard, Camera } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { SUBSCRIPTION_TIERS, formatMmk, getTierPrice } from '@/lib/subscriptionTiers'
import type { StationStatusReport, StationClaim, Station, SubscriptionTierRequested } from '@/types'

type Tab = 'flagged' | 'registrations' | 'claims'
type PaymentMethod = 'KBZ_PAY' | 'WAVEPAY' | 'BANK_TRANSFER'

export function AdminPage() {
  const { t } = useTranslation()
  const { isAdmin } = useAuthStore()
  const [tab, setTab] = useState<Tab>('registrations')
  const [flagged, setFlagged] = useState<StationStatusReport[]>([])
  const [claims, setClaims] = useState<StationClaim[]>([])
  const [registrations, setRegistrations] = useState<Station[]>([])
  const [loading, setLoading] = useState(true)
  const [workingId, setWorkingId] = useState<string | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('KBZ_PAY')
  const [paymentReference, setPaymentReference] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void loadAll()
  }, [])

  async function loadAll() {
    setLoading(true)
    setError(null)
    const [flaggedRes, claimsRes, registrationsRes] = await Promise.all([
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
    ])
    setFlagged(flaggedRes.data ?? [])
    setClaims(claimsRes.data ?? [])
    setRegistrations((registrationsRes.data ?? []) as Station[])
    setLoading(false)
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

  async function rejectRegistration(station: Station) {
    const rejectReason = window.prompt(t('admin.rejectReason'), t('admin.tierUnderDeclaredReject'))
    if (rejectReason === null) return
    setWorkingId(station.id)
    setError(null)
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('admin-reject-registration', {
        body: { station_id: station.id, reason: rejectReason },
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
          {t('admin.registrationQueueSummary', { registrations: registrations.length, claims: claims.length })}
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
                        loading={workingId === station.id}
                        onClick={() => void rejectRegistration(station)}
                      >
                        {t('admin.reject')}
                      </Button>
                    </div>
                    {!station.payment_received_at && (
                      <p className="mt-2 text-xs text-amber-700">Payment not marked yet. Approve is disabled.</p>
                    )}
                  </div>
                )
              })}
            </div>
          )
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
