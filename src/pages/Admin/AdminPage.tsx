import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Flag, Store, ShieldAlert } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import type { StationStatusReport, StationClaim } from '@/types'

type Tab = 'flagged' | 'claims'

export function AdminPage() {
  const { t } = useTranslation()
  const { isAdmin } = useAuthStore()
  const [tab, setTab] = useState<Tab>('flagged')
  const [flagged, setFlagged] = useState<StationStatusReport[]>([])
  const [claims, setClaims] = useState<StationClaim[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void loadAll()
  }, [])

  async function loadAll() {
    setLoading(true)
    const [flaggedRes, claimsRes] = await Promise.all([
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
    ])
    setFlagged(flaggedRes.data ?? [])
    setClaims(claimsRes.data ?? [])
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
    await supabase
      .from('station_claims')
      .update({ status: 'APPROVED', reviewed_at: new Date().toISOString() })
      .eq('id', id)
    // Grant verified to station
    const claim = claims.find((c) => c.id === id)
    if (claim) {
      await supabase
        .from('stations')
        .update({ is_verified: true, verified_owner_id: claim.user_id })
        .eq('id', claim.station_id)
    }
    setClaims((prev) => prev.filter((c) => c.id !== id))
  }

  async function rejectClaim(id: string) {
    await supabase
      .from('station_claims')
      .update({ status: 'REJECTED', reviewed_at: new Date().toISOString() })
      .eq('id', id)
    setClaims((prev) => prev.filter((c) => c.id !== id))
  }

  if (!isAdmin) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <div>
          <ShieldAlert className="mx-auto mb-3 h-12 w-12 text-gray-300" />
          <p className="text-gray-500">Admin access required.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-100 bg-white px-4 py-3">
        <h1 className="text-lg font-bold text-gray-900">{t('admin.title')}</h1>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100 bg-white">
        <button
          onClick={() => setTab('flagged')}
          className={`flex flex-1 items-center justify-center gap-1.5 py-3 text-sm font-medium transition-all ${tab === 'flagged' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500'}`}
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
          className={`flex flex-1 items-center justify-center gap-1.5 py-3 text-sm font-medium transition-all ${tab === 'claims' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500'}`}
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
        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : tab === 'flagged' ? (
          flagged.length === 0 ? (
            <p className="py-12 text-center text-gray-400">{t('admin.noFlagged')}</p>
          ) : (
            <div className="space-y-3">
              {flagged.map((report) => (
                <div key={report.id} className="rounded-xl border border-gray-200 bg-white p-4">
                  <p className="text-xs text-gray-500 mb-2">
                    Report ID: {report.id.slice(0, 8)}… · {report.reporter_role}
                  </p>
                  <pre className="text-xs bg-gray-50 rounded p-2 overflow-x-auto">
                    {JSON.stringify(report.fuel_statuses, null, 2)}
                  </pre>
                  {report.note && (
                    <p className="mt-2 text-xs italic text-gray-600">"{report.note}"</p>
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
          <p className="py-12 text-center text-gray-400">{t('admin.noClaims')}</p>
        ) : (
          <div className="space-y-3">
            {claims.map((claim) => (
              <div key={claim.id} className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="text-xs text-gray-500 mb-1">Station: {claim.station_id.slice(0, 8)}…</p>
                <p className="text-xs text-gray-500">User: {claim.user_id.slice(0, 8)}…</p>
                <p className="text-xs text-gray-400 mt-1">
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
