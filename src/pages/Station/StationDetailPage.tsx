import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, MapPin, Navigation, Clock, CheckCircle, Bell, BellOff } from 'lucide-react'
import { useState } from 'react'
import { useStationDetail } from '@/hooks/useNearbyStations'
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
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'

export function StationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'en' | 'my'
  const { user } = useAuthStore()
  const [isFollowing, setIsFollowing] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const [claimMessage, setClaimMessage] = useState<string | null>(null)

  const { station, reports, loading, error, refresh } = useStationDetail(id!)

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
    } else {
      await supabase
        .from('station_followers')
        .insert({ user_id: user.id, station_id: station.id })
      setIsFollowing(true)
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
            {station.is_verified && (
              <Badge variant="verified">
                <CheckCircle className="mr-0.5 h-3 w-3" />
                {t('station.verifiedOwnerClaimed')}
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
