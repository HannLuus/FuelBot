import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft } from 'lucide-react'

export function PrivacyPage() {
  const { t } = useTranslation()

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link
            to="/"
            className="flex items-center gap-2 text-gray-800 active:opacity-80"
          >
            <img src="/FuelbotLogo.png" alt="" className="h-8 w-auto" />
            <span className="font-bold">{t('app.name')}</span>
          </Link>
          <Link
            to="/home"
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-gray-700 active:bg-gray-100"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('legal.back')}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900">{t('legal.privacyTitle')}</h1>
        <p className="mt-1 text-sm text-gray-700">{t('legal.lastUpdated')}</p>

        <div className="mt-6 space-y-4 text-gray-800">
          <section>
            <h2 className="text-lg font-semibold text-gray-900">{t('legal.privacyDataTitle')}</h2>
            <p className="mt-1 text-gray-700">{t('legal.privacyDataBody')}</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">{t('legal.privacyUseTitle')}</h2>
            <p className="mt-1 text-gray-700">{t('legal.privacyUseBody')}</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">{t('legal.privacyStoredTitle')}</h2>
            <p className="mt-1 text-gray-700">{t('legal.privacyStoredBody')}</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">{t('legal.privacyRightsTitle')}</h2>
            <p className="mt-1 text-gray-700">{t('legal.privacyRightsBody')}</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">{t('legal.privacyContactTitle')}</h2>
            <p className="mt-1 text-gray-700">
              <a href={`mailto:${t('landing.contactEmail')}`} className="text-blue-600 underline hover:text-blue-800">
                {t('landing.footerContact')}
              </a>
            </p>
          </section>
        </div>

        <p className="mt-8 text-sm text-gray-700">
          <Link to="/terms" className="font-medium text-blue-600 underline">
            {t('legal.termsOfService')}
          </Link>
        </p>
      </main>
    </div>
  )
}
