import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowRight, Globe, Users, Store, ShieldCheck, Trophy, Gift } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { usePWAInstall } from '@/hooks/usePWAInstall'
import { SUBSCRIPTION_TIERS, formatMmk } from '@/lib/subscriptionTiers'
import { supabase } from '@/lib/supabase'

interface RecognitionStation {
  id: string
  name: string
  township: string
  city: string
  recognition_photo_url: string | null
}

interface TopReporter {
  user_id: string
  display_name: string | null
  report_count: number
  rank: number
}

export function LandingPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const lang = i18n.language === 'my' ? 'my' : 'en'
  const [recognitions, setRecognitions] = useState<RecognitionStation[]>([])
  const [topReporters, setTopReporters] = useState<TopReporter[]>([])
  const [showIOSInstallModal, setShowIOSInstallModal] = useState(false)
  const { showInstallUI, canInstall, isIOS, isPrompting, prompt } = usePWAInstall()

  useEffect(() => {
    void loadRecognitions()
    void loadTopReporters()
  }, [])

  useEffect(() => {
    if (!showIOSInstallModal) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setShowIOSInstallModal(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showIOSInstallModal])

  async function loadRecognitions() {
    const { data } = await supabase
      .from('stations')
      .select('id, name, township, city, recognition_photo_url')
      .eq('recognition_photo_confirmed', true)
      .eq('is_verified', true)
      .order('updated_at', { ascending: false })
      .limit(6)

    setRecognitions((data ?? []) as RecognitionStation[])
  }

  async function loadTopReporters() {
    const { data } = await supabase.rpc('get_top_reporters', {
      period_days: 30,
      result_limit: 10,
    })
    setTopReporters((data ?? []) as TopReporter[])
  }

  function toggleLang() {
    const next = lang === 'en' ? 'my' : 'en'
    void i18n.changeLanguage(next)
    localStorage.setItem('fuelbot_lang', next)
  }

  async function handleInstallClick() {
    if (canInstall) {
      await prompt()
    } else if (isIOS) {
      setShowIOSInstallModal(true)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <button
            onClick={() => navigate('/landing')}
            className="flex items-center gap-2"
          >
            <img src="/FuelbotLogo.png" alt="" className="h-8 w-auto" />
            <span className="text-base font-bold text-gray-900">{t('app.name')}</span>
          </button>
          <div className="flex items-center gap-2">
            {showInstallUI && (
              <button
                type="button"
                onClick={handleInstallClick}
                disabled={isPrompting}
                className="flex min-h-[44px] min-w-[44px] flex-shrink-0 items-center justify-center rounded-xl active:bg-gray-100 disabled:opacity-60 disabled:pointer-events-none"
                aria-label={t('landing.installAppAria')}
                title={t('landing.installApp')}
              >
                <img src="/FuelbotLogo.png" alt="" className="h-7 w-7" />
              </button>
            )}
            <button
              onClick={toggleLang}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-sm font-semibold text-gray-700 active:bg-gray-100"
              aria-label={t('landing.toggleLanguage')}
            >
              <Globe className="h-4 w-4" />
            </button>
            <Link
              to="/auth"
              className="flex min-h-[44px] items-center rounded-xl px-3 text-sm font-semibold text-gray-700 active:bg-gray-100"
            >
              {t('auth.signIn')}
            </Link>
            <Link
              to="/auth?mode=signup"
              className="flex min-h-[44px] items-center rounded-xl px-3 text-sm font-semibold text-blue-600 active:bg-blue-50"
            >
              {t('auth.signUp')}
            </Link>
            <Button size="sm" onClick={() => navigate('/home')}>
              {t('landing.enterApp')}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900">{t('landing.title')}</h1>
          <p className="mt-2 text-gray-700">{t('landing.subtitle')}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => navigate('/home')}>
              {t('landing.openFuelBot')}
            </Button>
            <Button variant="secondary" onClick={() => navigate('/operator')}>
              {t('landing.registerStationCta')}
            </Button>
          </div>
        </section>

        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">{t('landing.whatWeAchieveTitle')}</h2>
          </div>
          <ul className="space-y-2 text-gray-700">
            <li>{t('landing.whatWeAchieveFuel')}</li>
            <li>{t('landing.whatWeAchieveTrust')}</li>
            <li>{t('landing.whatWeAchieveHelp')}</li>
            <li>{t('landing.whatWeAchieveMyanmar')}</li>
          </ul>
        </section>

        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Users className="h-5 w-5 text-green-600" />
            <h2 className="text-lg font-semibold text-gray-900">{t('landing.whatYouEarnTitle')}</h2>
          </div>
          <p className="text-gray-700">{t('landing.whatYouEarnBody')}</p>
          <div className="mt-4">
            <Link to="/operator" className="text-sm font-semibold text-blue-600 underline">
              {t('landing.getReferralCodeCta')}
            </Link>
          </div>
        </section>

        {/* Top reporters leaderboard */}
        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="mb-1 flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500" />
            <h2 className="text-lg font-semibold text-gray-900">{t('landing.topReportersTitle')}</h2>
          </div>
          <p className="mb-4 text-sm text-gray-700">{t('landing.topReportersSubtitle')}</p>
          {topReporters.length === 0 ? (
            <p className="text-sm text-gray-700">{t('landing.topReportersEmpty')}</p>
          ) : (
            <ol className="space-y-2">
              {topReporters.map((reporter) => {
                const isTop = Number(reporter.rank) === 1
                return (
                  <li
                    key={reporter.user_id}
                    className={[
                      'flex items-center gap-3 rounded-xl border px-4 py-3',
                      isTop
                        ? 'border-amber-300 bg-amber-50'
                        : 'border-gray-200 bg-gray-50',
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
                    <span className="flex-1 text-sm font-semibold text-gray-900">
                      {reporter.display_name ?? `Reporter #${reporter.rank}`}
                    </span>
                    <span className="text-sm text-gray-700">
                      {t('landing.topReporterReports', { count: reporter.report_count })}
                    </span>
                    {isTop && (
                      <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">
                        {t('landing.topReporterGuaranteed')}
                      </span>
                    )}
                  </li>
                )
              })}
            </ol>
          )}
        </section>

        {/* Reward rules */}
        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Gift className="h-5 w-5 text-green-600" />
            <h2 className="text-lg font-semibold text-gray-900">{t('landing.rewardRulesTitle')}</h2>
          </div>
          <ul className="space-y-2 text-sm text-gray-700">
            <li className="flex gap-2"><span className="mt-0.5 text-gray-400">•</span>{t('landing.rewardRulesOnceADay')}</li>
            <li className="flex gap-2"><span className="mt-0.5 text-gray-400">•</span>{t('landing.rewardRulesMinimum')}</li>
            <li className="flex gap-2"><span className="mt-0.5 text-amber-500">★</span>{t('landing.rewardRulesTopPerformer')}</li>
            <li className="flex gap-2"><span className="mt-0.5 text-blue-500">◉</span>{t('landing.rewardRulesDraw')}</li>
            <li className="flex gap-2"><span className="mt-0.5 text-green-500">◆</span>{t('landing.rewardRulesPartner')}</li>
            <li className="flex gap-2"><span className="mt-0.5 text-gray-400">•</span>{t('landing.rewardRulesSignIn')}</li>
          </ul>
          <div className="mt-4">
            <Button size="sm" variant="secondary" onClick={() => navigate('/auth?mode=signup')}>
              {t('auth.signUp')}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </section>

        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Store className="h-5 w-5 text-amber-600" />
            <h2 className="text-lg font-semibold text-gray-900">{t('landing.stationPricingTitle')}</h2>
          </div>
          <div className="rounded-xl border border-gray-200 p-4">
            <p className="font-semibold text-gray-900">{SUBSCRIPTION_TIERS[0].name[lang]}</p>
            <p className="mt-1 text-sm text-gray-700">{SUBSCRIPTION_TIERS[0].description[lang]}</p>
            <p className="mt-2 text-base font-bold text-gray-900">
              {formatMmk(SUBSCRIPTION_TIERS[0].annualPriceMmk)} / {t('landing.perYear')}
            </p>
          </div>
          <p className="mt-3 text-sm text-gray-700">{t('landing.stationPricingFooter')}</p>
          <p className="mt-3 text-sm font-medium text-gray-800">{t('landing.whatStationGetsTitle')}</p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-gray-700">
            <li>{t('landing.whatStationGetsReliability')}</li>
            <li>{t('landing.whatStationGetsUptime')}</li>
            <li>{t('landing.whatStationGetsCompare')}</li>
          </ul>
          <p className="mt-3">
            <Link to="/benefits/station-owners" className="text-sm font-medium text-blue-600 underline active:text-blue-800">
              {t('landing.benefitsStationCta')}
            </Link>
          </p>
        </section>

        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">{t('landing.fleetTitle')}</h2>
          <p className="mt-2 text-gray-700">{t('landing.fleetBody')}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              to="/auth"
              className="inline-flex min-h-[44px] items-center rounded-xl bg-gray-100 px-4 text-sm font-semibold text-gray-800 active:bg-gray-200"
            >
              {t('landing.fleetSignIn')}
            </Link>
            <Link
              to="/b2b"
              className="inline-flex min-h-[44px] items-center rounded-xl border border-gray-300 bg-white px-4 text-sm font-semibold text-blue-600 active:bg-gray-50"
            >
              {t('landing.fleetContactCta')}
            </Link>
            <Link
              to="/benefits/fleet-owners"
              className="inline-flex min-h-[44px] items-center rounded-xl px-4 text-sm font-medium text-gray-700 underline active:bg-gray-100"
            >
              {t('landing.benefitsFleetCta')}
            </Link>
          </div>
        </section>

        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">{t('landing.heroTitle')}</h2>
          <p className="mt-1 text-sm text-gray-700">{t('landing.heroSubtitle')}</p>
          {recognitions.length === 0 ? (
            <p className="mt-3 text-sm text-gray-700">{t('landing.heroEmpty')}</p>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {recognitions.map((station) => (
                <article key={station.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                  {station.recognition_photo_url ? (
                    <img
                      src={station.recognition_photo_url}
                      alt={station.name}
                      className="h-40 w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-40 items-center justify-center bg-gray-100 text-gray-700">
                      {t('landing.photoPending')}
                    </div>
                  )}
                  <div className="p-3">
                    <p className="font-semibold text-gray-900">{station.name}</p>
                    <p className="text-sm text-gray-700">{station.township}, {station.city}</p>
                    <p className="mt-1 text-xs text-gray-700">{t('landing.heroCardCaption')}</p>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>

      {showIOSInstallModal && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ios-install-title"
          onClick={() => setShowIOSInstallModal(false)}
        >
          <div
            className="max-w-sm rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="ios-install-title" className="text-lg font-semibold text-gray-900">
              {t('landing.installIOSTitle')}
            </h2>
            <p className="mt-2 text-sm text-gray-700">{t('landing.installIOSSteps')}</p>
            <Button className="mt-4 w-full" onClick={() => setShowIOSInstallModal(false)}>
              {t('common.close')}
            </Button>
          </div>
        </div>
      )}

      <footer className="border-t border-gray-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-4">
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-gray-700">
            <Link to="/terms" className="font-medium text-blue-600 underline">
              {t('legal.termsOfService')}
            </Link>
            <Link to="/privacy" className="font-medium text-blue-600 underline">
              {t('legal.privacyPolicy')}
            </Link>
            <Link to="/benefits/station-owners" className="font-medium text-blue-600 underline">
              {t('landing.benefitsStationCta')}
            </Link>
            <Link to="/benefits/fleet-owners" className="font-medium text-blue-600 underline">
              {t('landing.benefitsFleetCta')}
            </Link>
          </div>
          <p className="mt-2 text-center text-sm text-gray-700">
            <a href={`mailto:${t('landing.contactEmail')}`} className="text-blue-600 underline hover:text-blue-800">
              {t('landing.footerContact')}
            </a>
          </p>
        </div>
      </footer>
    </div>
  )
}
