import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Gift, Trophy } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useAuthStore } from '@/stores/authStore'
import { ReporterDisplayNameCard } from '@/components/rewards/ReporterDisplayNameCard'
import { useTopReporters } from '@/hooks/useTopReporters'
import { TopReportersList } from '@/components/rewards/TopReportersList'

export function LeaderboardPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { reporters, loading, error, refetch } = useTopReporters()

  useEffect(() => {
    const title = `${t('nav.leaderboard')} — ${t('app.name')}`
    document.title = title
    return () => {
      document.title = t('app.name')
    }
  }, [t])

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <Button size="sm" variant="secondary" type="button" onClick={() => navigate('/landing')}>
            <ArrowLeft className="h-4 w-4" />
            {t('common.close')}
          </Button>
          <h1 className="text-lg font-semibold text-gray-900">{t('landing.topReportersTitle')}</h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        <p className="text-sm text-gray-700">{t('landing.topReportersSubtitle')}</p>
        <p className="text-sm">
          <Link to="/landing" className="font-medium text-blue-600 underline">
            {t('leaderboard.backToWebsite')}
          </Link>
          <span className="mx-2 text-gray-400" aria-hidden>
            ·
          </span>
          <Link to="/earn" className="font-medium text-blue-600 underline">
            {t('landing.getReferralCodeCta')}
          </Link>
        </p>

        {user ? (
          <ReporterDisplayNameCard user={user} onSaved={refetch} />
        ) : (
          <p className="mb-4 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
            {t('leaderboard.displayNameSignInHint')}
          </p>
        )}

        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="mb-1 flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500" />
            <h2 className="text-lg font-semibold text-gray-900">{t('landing.topReportersTitle')}</h2>
          </div>
          {error ? (
            <p className="mt-4 text-sm text-red-700">{t('errors.generic')}</p>
          ) : (
            <div className="mt-4">
              <TopReportersList reporters={reporters} loading={loading} />
            </div>
          )}
        </section>

        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Gift className="h-5 w-5 text-green-600" />
            <h2 className="text-lg font-semibold text-gray-900">{t('landing.rewardRulesTitle')}</h2>
          </div>
          <ul className="space-y-2 text-sm text-gray-700">
            <li className="flex gap-2">
              <span className="mt-0.5 text-gray-400">•</span>
              {t('landing.rewardRulesOnceADay')}
            </li>
            <li className="flex gap-2">
              <span className="mt-0.5 text-gray-400">•</span>
              {t('landing.rewardRulesStationAdds')}
            </li>
            <li className="flex gap-2">
              <span className="mt-0.5 text-gray-400">•</span>
              {t('landing.rewardRulesMinimum')}
            </li>
            <li className="flex gap-2">
              <span className="mt-0.5 text-blue-500">◉</span>
              {t('landing.rewardRulesDraw')}
            </li>
            <li className="flex gap-2">
              <span className="mt-0.5 text-gray-400">•</span>
              {t('landing.rewardRulesSignIn')}
            </li>
          </ul>
        </section>
      </main>
    </div>
  )
}
