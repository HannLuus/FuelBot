import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Zap, ArrowRight, Globe, Users, Store, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { SUBSCRIPTION_TIERS, formatMmk } from '@/lib/subscriptionTiers'
import { supabase } from '@/lib/supabase'

interface RecognitionStation {
  id: string
  name: string
  township: string
  city: string
  recognition_photo_url: string | null
}

export function LandingPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const lang = i18n.language === 'my' ? 'my' : 'en'
  const [recognitions, setRecognitions] = useState<RecognitionStation[]>([])

  useEffect(() => {
    void loadRecognitions()
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

  function toggleLang() {
    const next = lang === 'en' ? 'my' : 'en'
    void i18n.changeLanguage(next)
    localStorage.setItem('fuelbot_lang', next)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <button
            onClick={() => navigate('/landing')}
            className="flex items-center gap-2"
          >
            <span className="rounded-lg bg-blue-600 p-2">
              <Zap className="h-4 w-4 text-white" />
            </span>
            <span className="text-base font-bold text-gray-900">{t('app.name')}</span>
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleLang}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-sm font-semibold text-gray-700 active:bg-gray-100"
              aria-label={t('landing.toggleLanguage')}
            >
              <Globe className="h-4 w-4" />
            </button>
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

        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Store className="h-5 w-5 text-amber-600" />
            <h2 className="text-lg font-semibold text-gray-900">{t('landing.stationPricingTitle')}</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {SUBSCRIPTION_TIERS.map((tier) => (
              <div key={tier.key} className="rounded-xl border border-gray-200 p-3">
                <p className="font-semibold text-gray-900">{tier.name[lang]}</p>
                <p className="text-sm text-gray-700">{tier.description[lang]}</p>
                <p className="mt-2 text-base font-bold text-gray-900">
                  {formatMmk(tier.annualPriceMmk)} / {t('landing.perYear')}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-sm text-gray-700">{t('landing.stationPricingFooter')}</p>
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
      <footer className="border-t border-gray-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-4 text-center text-sm text-gray-700">
          {t('landing.footerContact')}
        </div>
      </footer>
    </div>
  )
}
