import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ThumbsUp, ThumbsDown } from 'lucide-react'
import { clsx } from 'clsx'
import { FuelChip } from '@/components/ui/FuelChip'
import { FUEL_CODES, formatRelativeTime, QUEUE_LABEL, REPORTER_ROLE_LABEL } from '@/lib/fuelUtils'
import { supabase } from '@/lib/supabase'
import { getDeviceHash } from '@/lib/deviceHash'
import type { StationStatusReport } from '@/types'

interface ReportRowProps {
  report: StationStatusReport
  onVoted?: () => void
}

export function ReportRow({ report, onVoted }: ReportRowProps) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'en' | 'my'
  const [myVote, setMyVote] = useState<'CONFIRM' | 'DISAGREE' | null>(null)
  const [voting, setVoting] = useState(false)

  const fuelEntries = FUEL_CODES.map((code) => ({
    code,
    fuelStatus: report.fuel_statuses[code] ?? 'UNKNOWN',
  })).filter((e) => e.fuelStatus !== 'UNKNOWN')

  async function vote(type: 'CONFIRM' | 'DISAGREE') {
    if (myVote || voting) return
    setVoting(true)
    try {
      const deviceHash = await getDeviceHash()
      const { error } = await supabase.from('status_votes').insert({
        report_id: report.id,
        device_hash: deviceHash,
        vote: type,
      })
      if (!error) {
        setMyVote(type)
        onVoted?.()
      }
    } finally {
      setVoting(false)
    }
  }

  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap gap-1">
            {fuelEntries.map(({ code, fuelStatus }) => (
              <FuelChip key={code} code={code} status={fuelStatus} size="sm" />
            ))}
          </div>
          {report.queue_bucket && report.queue_bucket !== 'NONE' && (
            <p className="mt-1 text-xs text-gray-500">
              {QUEUE_LABEL[report.queue_bucket][lang]}
            </p>
          )}
          {report.note && (
            <p className="mt-1 text-xs italic text-gray-600">"{report.note}"</p>
          )}
        </div>
        <div className="text-right text-xs text-gray-400 shrink-0">
          <p>{REPORTER_ROLE_LABEL[report.reporter_role][lang]}</p>
          <p>{formatRelativeTime(report.reported_at)}</p>
        </div>
      </div>

      {/* Vote buttons — min 44px tall for thumb tapping */}
      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={() => void vote('CONFIRM')}
          disabled={!!myVote || voting}
          className={clsx(
            'flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-all active:scale-95',
            myVote === 'CONFIRM'
              ? 'bg-green-100 text-green-700'
              : 'bg-white text-gray-600 active:bg-green-50',
          )}
        >
          <ThumbsUp className="h-4 w-4" />
          {myVote === 'CONFIRM' ? t('vote.confirmed') : t('vote.confirm')}
          {(report.confirm_count ?? 0) > 0 && (
            <span className="text-gray-400 text-xs">({report.confirm_count})</span>
          )}
        </button>
        <button
          onClick={() => void vote('DISAGREE')}
          disabled={!!myVote || voting}
          className={clsx(
            'flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-all active:scale-95',
            myVote === 'DISAGREE'
              ? 'bg-red-100 text-red-700'
              : 'bg-white text-gray-600 active:bg-red-50',
          )}
        >
          <ThumbsDown className="h-4 w-4" />
          {myVote === 'DISAGREE' ? t('vote.disagreed') : t('vote.disagree')}
        </button>
      </div>
    </div>
  )
}
