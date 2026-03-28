import { useTranslation } from 'react-i18next'
import { Spinner } from '@/components/ui/Spinner'
import type { TopReporterRow } from '@/hooks/useTopReporters'

export function TopReportersList({
  reporters,
  loading = false,
}: {
  reporters: TopReporterRow[]
  loading?: boolean
}) {
  const { t } = useTranslation()

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <Spinner />
      </div>
    )
  }

  if (reporters.length === 0) {
    return <p className="text-sm text-gray-700">{t('landing.topReportersEmpty')}</p>
  }

  return (
    <ol className="space-y-2">
      {reporters.map((reporter) => {
        const isTop = Number(reporter.rank) === 1
        return (
          <li
            key={reporter.user_id}
            className={[
              'flex items-center gap-3 rounded-xl border px-4 py-3',
              isTop ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-gray-50',
            ].join(' ')}
          >
            <span
              className={[
                'min-w-[2rem] text-center text-sm font-bold',
                isTop ? 'text-amber-600' : 'text-gray-700',
              ].join(' ')}
            >
              {t('landing.topReporterRank', { rank: reporter.rank })}
            </span>
            <span className="flex-1 text-sm font-semibold text-gray-900">{reporter.display_name}</span>
            <span className="text-sm text-gray-700">
              {t('landing.topReporterReports', { count: reporter.report_count })}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
