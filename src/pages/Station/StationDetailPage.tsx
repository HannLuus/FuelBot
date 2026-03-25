import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, MapPin, Navigation, Clock, CheckCircle, Bell, BellOff, TrendingUp } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useStationDetail } from '@/hooks/useNearbyStations'
import { supabase } from '@/lib/supabase'
import { FuelChip } from '@/components/ui/FuelChip'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { ConfidenceBadge } from '@/components/ui/ConfidenceBadge'
import { ReportRow } from '@/components/station/ReportRow'
import {
  FUEL_CODES,
  formatRelativeTime,
  QUEUE_LABEL,
  REPORTER_ROLE_LABEL,
} from '@/lib/fuelUtils'
import { useAuthStore } from '@/stores/authStore'
import { subscribeToPush, unsubscribeFromPush } from '@/lib/pushSubscription'

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

export function StationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'en' | 'my'
  const { user, session } = useAuthStore()
  const [isFollowing, setIsFollowing] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const [claimMessage, setClaimMessage] = useState<string | null>(null)
  const [reportWrongLocationSent, setReportWrongLocationSent] = useState(false)
  const [reportWrongLocationLoading, setReportWrongLocationLoading] = useState(false)
  const [reportWrongLocationError, setReportWrongLocationError] = useState<string | null>(null)
  const [reliability, setReliability] = useState<ReliabilityRow | null>(null)
  const [uptime, setUptime] = useState<UptimeRow | null>(null)

  const { station, reports, loading, error, refresh } = useStationDetail(id!)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    void (async () => {
      const { data, error } = await supabase.rpc('get_station_reliability', { p_station_id: id })
      if (cancelled || error) {
        if (!cancelled) setReliability(null)
        return
      }
      const row = Array.isArray(data) ? data[0] : data
      setReliability(row ?? null)
    })()
    return () => { cancelled = true }
  }, [id])

  useEffect(() => {
    if (!id) return
    let cancelled = false
    void (async () => {
      const { data, error } = await supabase.rpc('get_station_uptime', { p_station_id: id, p_days: 30 })
      if (cancelled || error) {
        if (!cancelled) setUptime(null)
        return
      }
      const row = Array.isArray(data) ? data[0] : data
      setUptime(row ?? null)
    })()
    return () => { cancelled = true }
  }, [id])

  function openInMaps() {
    if (!station) return
    const query = encodeURIComponent(station.name)
    const coords = `${station.lat},${station.lng}`
    const url = /iPhone|iPad|iPod/.test(navigator.userAgent)
      ? `maps://?q=${query}&ll=${coords}`
      : `https://www.google.com/maps/search/?api=1&query=${coords}`
    window.open(url, '_blank')
  }

  async function toggleFollow() {
    if (!user || !station) return
    if (isFollowing) {
      await supabase
        .from('station_followers')
        .delete()
        .eq('user_id', user.id)
        .eq('station_id', station.id)
      setIsFollowing(false)
      await unsubscribeFromPush()
    } else {
      await supabase
        .from('station_followers')
        .insert({ user_id: user.id, station_id: station.id })
      setIsFollowing(true)
      // Subscribe to push notifications so the user receives alerts when fuel is back in stock.
      // subscribeToPush handles permission prompting and saving the subscription to the DB.
      await subscribeToPush()
    }
  }

  async function claimStation() {
    if (!user || !station) return
    setClaiming(true)
    setClaimMessage(null)
    try {
      const { error } = await supabase
        .from('station_claims')
        .insert({
          station_id: station.id,
          user_id: user.id,
          status: 'PENDING',
        })
      if (error) throw error

      await supabase.functions.invoke('notify-admin', {
        body: {
          kind: 'PENDING_CLAIM',
          station_id: station.id,
        },
      })
      setClaimMessage(t('operator.claimPending'))
    } catch {
      setClaimMessage(t('errors.generic'))
    } finally {
      setClaiming(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    )
  }

  if (error || !station) {
    return (
      <div className="p-4 text-center text-red-600">
        {t('errors.notFound')}
        <Button size="sm" variant="secondary" className="mt-3 mx-auto block" onClick={() => navigate(-1)}>
          {t('nav.nearby')}
        </Button>
      </div>
    )
  }

  const status = station.current_status

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-gray-100 bg-white px-2 py-1">
        {/* 44×44 back button */}
        <button
          onClick={() => navigate(-1)}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl active:bg-gray-100"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5 text-gray-700" />
        </button>
        <div className="min-w-0 flex-1 py-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <h1 className="truncate text-base font-bold text-gray-900">{station.name}</h1>
            {station.is_verified ? (
              <Badge variant="verified">
                <CheckCircle className="mr-0.5 h-3 w-3" />
                {t('station.verifiedOwnerClaimed')}
              </Badge>
            ) : station.verification_source === 'distributor' ? (
              <Badge variant="verified">
                <CheckCircle className="mr-0.5 h-3 w-3" />
                {t('station.verifiedDistributor')}
              </Badge>
            ) : station.verification_source === 'crowd' ? (
              <Badge variant="verified">
                <CheckCircle className="mr-0.5 h-3 w-3" />
                {t('station.verifiedCrowd')}
              </Badge>
            ) : null}
            {reliability && (reliability.reports_last_7d >= 3 || reliability.reports_last_30d >= 7) && (
              <Badge variant="default" className="gap-0.5">
                <TrendingUp className="h-3 w-3" />
                {t('station.oftenUpdated')}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1 text-xs text-gray-700">
            <MapPin className="h-3 w-3" />
            <span>{station.township}, {station.city}</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scroll-touch">
        {/* Fuel status grid */}
        <div className="bg-white px-4 pt-4 pb-3">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">{t('station.reportUpdate')}</h2>
          <div className="grid grid-cols-2 gap-2">
            {FUEL_CODES.map((code) => {
              const fuelStatus = status?.fuel_statuses_computed?.[code] ?? 'UNKNOWN'
              return (
                <FuelChip key={code} code={code} status={fuelStatus} size="md" />
              )
            })}
          </div>
          <p className="mt-3 rounded-xl bg-gray-50 px-3 py-2 text-xs leading-relaxed text-gray-700">
            {t('station.statusFromReportsDetail')}
          </p>

          {/* Queue + confidence */}
          {status && (
            <div className="mt-3 flex items-center justify-between text-xs text-gray-700">
              <div className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                <span>
                  {status.queue_bucket_computed
                    ? QUEUE_LABEL[status.queue_bucket_computed][lang]
                    : t('station.noData')}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span>{t('station.confidence')}</span>
                <ConfidenceBadge score={status.confidence_score} />
                {status.source_role && (
                  <span>· {REPORTER_ROLE_LABEL[status.source_role][lang]}</span>
                )}
              </div>
            </div>
          )}

          {status?.last_updated_at && (
            <p className="mt-1 text-xs text-gray-700">
              {t('station.lastUpdated', {
                time: formatRelativeTime(status.last_updated_at),
              })}
            </p>
          )}
          {station.referrer_user_id && (
            <p className="mt-1 text-xs text-gray-700">
              {station.referral_reward_status === 'PENDING'
                ? t('station.referrerRewardPending')
                : t('station.referrerRewarded')}
            </p>
          )}

          {/* Reliability (activity-based) + Uptime when available */}
          {(reliability && (reliability.reports_last_7d > 0 || reliability.reports_last_30d > 0)) ||
          (uptime?.has_sufficient_data && uptime.uptime_pct != null) ? (
            <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs font-semibold text-gray-700">{t('station.reliabilityTitle')}</p>
              {reliability && (reliability.reports_last_7d > 0 || reliability.reports_last_30d > 0) && (
                <>
              <p className="mt-1 text-xs text-gray-700">
                {t('station.reliabilitySummary', {
                  count7: reliability.reports_last_7d,
                  count30: reliability.reports_last_30d,
                })}
              </p>
              {reliability.city_name != null && reliability.city_stations_count != null && reliability.city_avg_reports_7d != null && (
                <p className="mt-1 text-xs text-gray-700">
                  {t('station.reliabilityVsCity', {
                    city: reliability.city_name,
                    count: reliability.city_stations_count,
                    avg7: reliability.city_avg_reports_7d,
                    avg30: reliability.city_avg_reports_30d ?? '—',
                  })}
                </p>
              )}
                </>
              )}
              {uptime?.has_sufficient_data && uptime.uptime_pct != null && (
                <p className="mt-2 text-xs font-medium text-gray-700">
                  {t('station.uptime30d')}: {uptime.uptime_pct}%
                </p>
              )}
            </div>
          ) : null}
        </div>

        {/* Actions */}
        <div className="flex gap-2 px-4 pb-4 pt-2">
          <Button
            variant="primary"
            size="lg"
            className="flex-1"
            onClick={() => navigate(`/report/${station.id}`)}
          >
            {t('station.reportUpdate')}
          </Button>
          <Button
            variant="secondary"
            size="md"
            onClick={openInMaps}
          >
            <Navigation className="h-4 w-4" />
            <span className="sr-only">{t('station.openInMaps')}</span>
          </Button>
          {user && (
            <Button
              variant="secondary"
              size="md"
              onClick={() => void toggleFollow()}
            >
              {isFollowing ? (
                <BellOff className="h-4 w-4 text-gray-700" />
              ) : (
                <Bell className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>

        {/* Recent reports */}
        {reports.length > 0 && (
          <div className="px-4 pb-6">
            <h2 className="mb-3 text-sm font-semibold text-gray-700">
              {t('station.recentReports')}
            </h2>
            <div className="space-y-2">
              {reports.map((report) => (
                <ReportRow
                  key={report.id}
                  report={report}
                  onVoted={refresh}
                />
              ))}
            </div>
          </div>
        )}

        {/* Report wrong location — so we can fix or remove bad data */}
        {station.id && station.verification_source !== 'distributor' && (
          <div className="mx-4 mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            {reportWrongLocationSent ? (
              <p className="text-sm text-amber-900">{t('station.reportWrongLocationSent')}</p>
            ) : (
              <>
                <p className="text-sm font-medium text-amber-900">
                  {t('station.reportWrongLocation')}
                </p>
                <p className="mt-1 text-xs text-amber-800">
                  {t('station.reportWrongLocationHint')}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={reportWrongLocationLoading}
                    onClick={async () => {
                      setReportWrongLocationError(null)
                      setReportWrongLocationLoading(true)
                      try {
                        const { error } = await supabase.functions.invoke('report-wrong-location', {
                          ...(session?.access_token && {
                            headers: { Authorization: `Bearer ${session.access_token}` },
                          }),
                          body: { station_id: station.id },
                        })
                        if (!error) setReportWrongLocationSent(true)
                      } finally {
                        setReportWrongLocationLoading(false)
                      }
                    }}
                  >
                    {t('station.reportWrongLocationButton')}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={reportWrongLocationLoading}
                    onClick={async () => {
                      setReportWrongLocationError(null)
                      setReportWrongLocationLoading(true)
                      try {
                        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
                          if (!navigator.geolocation) {
                            reject(new Error('UNSUPPORTED'))
                            return
                          }
                          navigator.geolocation.getCurrentPosition(resolve, reject, {
                            enableHighAccuracy: true,
                            timeout: 10000,
                            maximumAge: 0,
                          })
                        })
                        const { error } = await supabase.functions.invoke('report-wrong-location', {
                          ...(session?.access_token && {
                            headers: { Authorization: `Bearer ${session.access_token}` },
                          }),
                          body: {
                            station_id: station.id,
                            suggested_lat: position.coords.latitude,
                            suggested_lng: position.coords.longitude,
                          },
                        })
                        if (!error) setReportWrongLocationSent(true)
                        else setReportWrongLocationError(error.message ?? t('errors.generic'))
                      } catch (err) {
                        const msg =
                          err instanceof Error ? err.message : String(err)
                        if (msg === 'UNSUPPORTED')
                          setReportWrongLocationError(t('station.reportWrongLocationGeolocationUnsupported'))
                        else if (msg.includes('denied') || msg.includes('PERMISSION'))
                          setReportWrongLocationError(t('station.reportWrongLocationGeolocationDenied'))
                        else
                          setReportWrongLocationError(t('station.reportWrongLocationGeolocationError'))
                      } finally {
                        setReportWrongLocationLoading(false)
                      }
                    }}
                  >
                    {t('station.reportWrongLocationWithMyLocation')}
                  </Button>
                </div>
                {reportWrongLocationError && (
                  <p className="mt-2 text-xs text-amber-800">{reportWrongLocationError}</p>
                )}
              </>
            )}
          </div>
        )}

        {/* Claim station */}
        {!station.is_verified && user && (
          <div className="mx-4 mb-6 rounded-2xl bg-blue-50 p-4 text-center">
            <p className="text-sm font-medium text-blue-900">
              {t('station.claimStation')}
            </p>
            <Button
              size="sm"
              variant="primary"
              className="mt-2"
              loading={claiming}
              onClick={() => void claimStation()}
            >
              {t('operator.claimButton')}
            </Button>
            {claimMessage ? <p className="mt-2 text-xs text-blue-900">{claimMessage}</p> : null}
          </div>
        )}
      </div>
    </div>
  )
}
