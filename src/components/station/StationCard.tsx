import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { MapPin, Clock, CheckCircle } from 'lucide-react'
import { clsx } from 'clsx'
import { FuelChip } from '@/components/ui/FuelChip'
import { Badge } from '@/components/ui/Badge'
import { ConfidenceBadge } from '@/components/ui/ConfidenceBadge'
import { FUEL_CODES, formatDistance, formatRelativeTime, QUEUE_LABEL, REPORTER_ROLE_LABEL } from '@/lib/fuelUtils'
import type { StationWithStatus } from '@/types'

interface StationCardProps {
  station: StationWithStatus
}

export function StationCard({ station }: StationCardProps) {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'en' | 'my'
  const status = station.current_status

  const fuelEntries = FUEL_CODES.map((code) => ({
    code,
    fuelStatus: status?.fuel_statuses_computed?.[code] ?? 'UNKNOWN',
  })).filter((e) => e.fuelStatus !== 'UNKNOWN')

  const isStale = status?.is_stale ?? true
  const hasNoData = !status || !status.last_updated_at

  return (
    <button
      onClick={() => navigate(`/station/${station.id}`)}
      className={clsx(
        // Mobile-first card: generous padding, strong press feedback
        'w-full rounded-2xl border bg-white px-4 py-5 text-left shadow-sm',
        'transition-all active:scale-[0.97] active:shadow-none active:brightness-95',
        isStale ? 'border-orange-200' : 'border-gray-200',
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-base font-bold text-gray-900 leading-tight">{station.name}</span>
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
            {isStale && !hasNoData && (
              <Badge variant="stale">{t('station.stale')}</Badge>
            )}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-sm text-gray-700">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{station.township}</span>
            {station.distance_m !== undefined && (
              <>
                <span className="text-gray-700">·</span>
                <span className="font-medium text-gray-700">{formatDistance(station.distance_m)}</span>
              </>
            )}
          </div>
        </div>

        {status && (
          <div className="shrink-0 text-right">
            <ConfidenceBadge score={status.confidence_score} />
          </div>
        )}
      </div>

      {/* Fuel traffic lights — the main signal */}
      {fuelEntries.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {fuelEntries.map(({ code, fuelStatus }) => (
            <FuelChip key={code} code={code} status={fuelStatus} size="sm" />
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-gray-700">{t('station.noData')}</p>
      )}

      {/* Footer metadata */}
      {status && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-gray-700">
          <div className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            <span>
              {hasNoData
                ? t('station.noData')
                : t('station.lastUpdated', {
                    time: formatRelativeTime(status.last_updated_at),
                  })}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {status.source_role && (
              <span>{REPORTER_ROLE_LABEL[status.source_role][lang]}</span>
            )}
            {status.queue_bucket_computed && status.queue_bucket_computed !== 'NONE' && (
              <span className="font-medium text-gray-700">
                {QUEUE_LABEL[status.queue_bucket_computed][lang]}
              </span>
            )}
          </div>
        </div>
      )}
      {station.referrer_user_id && (
        <p className="mt-2 text-xs text-gray-700">
          {station.referral_reward_status === 'PENDING'
            ? t('station.referrerRewardPending')
            : t('station.referrerRewarded')}
        </p>
      )}
    </button>
  )
}
