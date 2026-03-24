import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowRight, Globe, Users, Store, ShieldCheck, Trophy, Gift, Menu, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { usePWAInstall } from '@/hooks/usePWAInstall'
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

const HERO_CAROUSEL_IMAGES = [
  '/landing-carousel/fuelbot-1.png',
  '/landing-carousel/fuelbot-2.png',
  '/landing-carousel/fuelbot-3.png',
]

export function LandingPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const lang = i18n.language === 'my' ? 'my' : 'en'
  const [recognitions, setRecognitions] = useState<RecognitionStation[]>([])
  const [topReporters, setTopReporters] = useState<TopReporter[]>([])
  const [showIOSInstallModal, setShowIOSInstallModal] = useState(false)
  const [carouselIndex, setCarouselIndex] = useState(0)
  const [showMobileMenu, setShowMobileMenu] = useState(false)
  const { canInstall, isIOS, isPrompting, prompt } = usePWAInstall()

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

  useEffect(() => {
    if (!showMobileMenu) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setShowMobileMenu(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showMobileMenu])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCarouselIndex((prev) => (prev + 1) % HERO_CAROUSEL_IMAGES.length)
    }, 18000)
    return () => window.clearInterval(timer)
  }, [])

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
    } else {
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
          <div className="hidden items-center gap-2 sm:flex">
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
            <Button size="sm" onClick={() => navigate('/home')}>
              {t('landing.enterApp')}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>

          <button
            type="button"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-gray-700 active:bg-gray-100 sm:hidden"
            onClick={() => setShowMobileMenu((prev) => !prev)}
            aria-label={showMobileMenu ? t('common.close') : 'Open menu'}
            aria-expanded={showMobileMenu}
          >
            {showMobileMenu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {showMobileMenu && (
          <div className="border-t border-gray-200 bg-white sm:hidden">
            <div className="mx-auto max-w-5xl space-y-2 px-4 py-3">
              <Button
                type="button"
                variant="secondary"
                className="w-full justify-center"
                onClick={() => {
                  setShowMobileMenu(false)
                  void handleInstallClick()
                }}
                disabled={isPrompting}
              >
                {t('landing.installApp')}
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="w-full justify-center"
                onClick={() => {
                  setShowMobileMenu(false)
                  toggleLang()
                }}
              >
                <Globe className="h-4 w-4" />
                {t('common.toggleLanguage')}
              </Button>
              <Link
                to="/auth"
                className="flex min-h-[44px] w-full items-center justify-center rounded-xl bg-gray-100 px-4 text-sm font-semibold text-gray-800 active:bg-gray-200"
                onClick={() => setShowMobileMenu(false)}
              >
                {t('auth.signIn')}
              </Link>
              <Button
                size="sm"
                className="w-full justify-center"
                onClick={() => {
                  setShowMobileMenu(false)
                  navigate('/home')
                }}
              >
                {t('landing.enterApp')}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        <section className="relative overflow-hidden rounded-2xl bg-white shadow-sm">
          <div className="relative aspect-[16/7] w-full bg-gray-100">
            {HERO_CAROUSEL_IMAGES.map((src, idx) => (
              <img
                key={src}
                src={src}
                alt={`FuelBot showcase ${idx + 1}`}
                className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${idx === carouselIndex ? 'opacity-100' : 'opacity-0'}`}
              />
            ))}
          </div>
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/40 px-2 py-1">
            {HERO_CAROUSEL_IMAGES.map((_, idx) => (
              <button
                key={idx}
                type="button"
                aria-label={`Show image ${idx + 1}`}
                onClick={() => setCarouselIndex(idx)}
                className={`h-2.5 w-2.5 rounded-full transition-colors ${idx === carouselIndex ? 'bg-white' : 'bg-white/55 hover:bg-white/80'}`}
              />
            ))}
          </div>
        </section>

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
            <Button
              type="button"
              variant="secondary"
              onClick={() => void handleInstallClick()}
              disabled={isPrompting}
            >
              {t('landing.installApp')}
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
            <Link to="/earn" className="text-sm font-semibold text-blue-600 underline">
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
            <li className="flex gap-2"><span className="mt-0.5 text-blue-500">◉</span>{t('landing.rewardRulesDraw')}</li>
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
              {isIOS ? t('landing.installIOSTitle') : t('landing.installHelpTitle')}
            </h2>
            <p className="mt-2 text-sm text-gray-700">{isIOS ? t('landing.installIOSSteps') : t('landing.installHelpSteps')}</p>
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
            <Link to="/contact" className="text-blue-600 underline hover:text-blue-800">
              {t('landing.footerContact')}
            </Link>
            <span className="mx-2">·</span>
            <a href={`mailto:${t('landing.contactEmail')}`} className="text-blue-600 underline hover:text-blue-800">
              {t('landing.contactEmail')}
            </a>
          </p>
        </div>
      </footer>
    </div>
  )
}
