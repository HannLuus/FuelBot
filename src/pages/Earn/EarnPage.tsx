import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Copy, Gift, Link as LinkIcon } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { ReporterDisplayNameCard } from '@/components/rewards/ReporterDisplayNameCard'

interface ReferralRewardRow {
  id: string
  station_id: string
  amount_mmk: number
  status: 'PENDING' | 'PAID' | 'COLLECTED'
  created_at: string
  stations: { name: string } | null
}

export function EarnPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user, loading } = useAuthStore()
  const [ownerCheckLoading, setOwnerCheckLoading] = useState(false)
  const [isStationOwner, setIsStationOwner] = useState(false)
  const [referralCode, setReferralCode] = useState<string | null>(null)
  const [rewards, setRewards] = useState<ReferralRewardRow[]>([])
  const [pageError, setPageError] = useState<string | null>(null)
  const [isSessionExpired, setIsSessionExpired] = useState(false)
  const [copyMessage, setCopyMessage] = useState<string | null>(null)
  const loadInFlightRef = useRef(false)

  const shareLink = useMemo(() => {
    if (!referralCode) return ''
    return `${window.location.origin}/station?ref=${encodeURIComponent(referralCode)}`
  }, [referralCode])

  useEffect(() => {
    if (copyMessage == null) return
    const timer = window.setTimeout(() => setCopyMessage(null), 1800)
    return () => window.clearTimeout(timer)
  }, [copyMessage])

  const loadOwnerAndEarnData = useCallback(async (userId: string) => {
    if (loadInFlightRef.current) return
    loadInFlightRef.current = true
    setOwnerCheckLoading(true)
    setPageError(null)
    setIsSessionExpired(false)
    try {
      const { data: ownerRow, error: ownerErr } = await supabase
        .from('stations')
        .select('id')
        .eq('verified_owner_id', userId)
        .limit(1)
        .maybeSingle()
      if (ownerErr) throw ownerErr

      const hasStation = !!ownerRow
      setIsStationOwner(hasStation)
      if (hasStation) {
        setReferralCode(null)
        setRewards([])
        return
      }

      // Refresh session and use the new access_token explicitly so the Edge Function receives a valid JWT.
      const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession()
      if (refreshErr || !refreshData.session?.access_token) {
        throw new Error('SESSION_EXPIRED')
      }
      const accessToken = refreshData.session.access_token

      const { data: codeData, error: codeErr } = await supabase.functions.invoke('get-referral-code', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (codeData?.error) throw new Error(String(codeData.error))
      if (codeErr) throw codeErr
      setReferralCode(typeof codeData?.code === 'string' ? codeData.code : null)

      const { data: rewardRows, error: rewardsErr } = await supabase
        .from('referral_rewards')
        .select('id, station_id, amount_mmk, status, created_at, stations(name)')
        .eq('referrer_user_id', userId)
        .order('created_at', { ascending: false })
      if (rewardsErr) {
        // Keep code visible even if rewards list fails.
        setRewards([])
      } else {
        setRewards((rewardRows ?? []) as unknown as ReferralRewardRow[])
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const is401 =
        msg === 'SESSION_EXPIRED' ||
        msg.toLowerCase().includes('unauthorized') ||
        (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 401)
      if (is401) {
        setIsSessionExpired(true)
        setPageError(t('earn.sessionExpired'))
      } else {
        setPageError(t('errors.generic'))
      }
    } finally {
      loadInFlightRef.current = false
      setOwnerCheckLoading(false)
    }
  }, [t])

  useEffect(() => {
    if (!user) {
      setIsStationOwner(false)
      setReferralCode(null)
      setRewards([])
      setPageError(null)
      setIsSessionExpired(false)
      setOwnerCheckLoading(false)
      return
    }
    void loadOwnerAndEarnData(user.id)
  }, [loadOwnerAndEarnData, user])

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopyMessage(t('earn.copied'))
    } catch {
      setCopyMessage(t('earn.copyFailed'))
    }
  }

  if (loading || ownerCheckLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center">
        <Gift className="mb-4 h-12 w-12 text-gray-700" />
        <h1 className="text-lg font-bold text-gray-900">{t('earn.title')}</h1>
        <p className="mt-2 text-sm text-gray-700">{t('earn.signInToGetCode')}</p>
        <Button className="mt-4" onClick={() => navigate('/auth?redirect=/earn')}>
          {t('auth.signIn')}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 bg-white px-4 py-3">
        <h1 className="text-lg font-bold text-gray-900">{t('earn.title')}</h1>
        <Link to="/help#guide-earnReferral" className="text-xs font-semibold text-blue-600 underline">
          {t('help.links.earnInline')}
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <p className="mb-3 text-center">
          <Link
            to="/leaderboard"
            className="text-sm font-semibold text-amber-800 underline decoration-amber-600 underline-offset-2"
          >
            {t('nav.leaderboard')} — {t('landing.topReportersTitle')}
          </Link>
        </p>
        <div className="mb-3">
          <ReporterDisplayNameCard user={user} />
        </div>
        {pageError && (
          <p className="mb-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{pageError}</p>
        )}
        {isSessionExpired && (
          <Button className="mb-3" size="sm" onClick={() => navigate('/auth?redirect=/earn')}>
            {t('auth.signIn')}
          </Button>
        )}

        {isStationOwner ? (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
            <p className="text-sm text-blue-900">{t('earn.stationOwnerMessage')}</p>
          </div>
        ) : (
          <>
            <section className="rounded-2xl border border-gray-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-700">
                {t('earn.yourReferralCode')}
              </p>
              <p className="mt-2 rounded-xl bg-gray-100 px-3 py-3 text-lg font-bold tracking-wide text-gray-900">
                {referralCode ?? t('earn.codeUnavailable')}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={!referralCode}
                  onClick={() => {
                    if (referralCode) void copyText(referralCode)
                  }}
                >
                  <Copy className="h-4 w-4" />
                  {t('earn.copyCode')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={!shareLink}
                  onClick={() => {
                    if (shareLink) void copyText(shareLink)
                  }}
                >
                  <LinkIcon className="h-4 w-4" />
                  {t('earn.copyLink')}
                </Button>
              </div>
              <p className="mt-3 text-xs text-gray-700">{t('earn.shareLinkLabel')}</p>
              <p className="mt-1 break-all text-xs font-medium text-blue-700">
                {shareLink || '—'}
              </p>
              {copyMessage && (
                <p className="mt-2 text-xs font-semibold text-green-700">{copyMessage}</p>
              )}
            </section>

            <section className="mt-4 rounded-2xl border border-gray-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-gray-900">{t('stationOwner.myReferralRewards')}</h2>
              {rewards.length === 0 ? (
                <p className="mt-2 text-sm text-gray-700">{t('earn.noReferralRewardsYet')}</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {rewards.map((reward) => (
                    <article key={reward.id} className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                      <p className="text-sm font-semibold text-gray-900">
                        {reward.stations?.name ?? reward.station_id}
                      </p>
                      <p className="text-xs text-gray-700">
                        {reward.amount_mmk.toLocaleString('en-US')} MMK
                      </p>
                      <p className="mt-1 text-xs text-gray-700">
                        {reward.status}
                        {' · '}
                        {new Date(reward.created_at).toLocaleDateString()}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}
