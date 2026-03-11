import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Zap, ArrowLeft } from 'lucide-react'

export function BenefitsFleetPage() {
  const { t } = useTranslation()

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link
            to="/"
            className="flex items-center gap-2 text-gray-800 active:opacity-80"
          >
            <Zap className="h-5 w-5 text-blue-600" />
            <span className="font-bold">{t('app.name')}</span>
          </Link>
          <Link
            to="/landing"
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-gray-700 active:bg-gray-100"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('benefits.fleetOwners.backToWebsite')}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900">
          {t('benefits.fleetOwners.title')}
        </h1>
        <p className="mt-2 text-gray-700">{t('benefits.fleetOwners.intro')}</p>

        <div className="mt-6 space-y-6 text-gray-800">
          <section>
            <h2 className="text-lg font-semibold text-gray-900">
              {t('benefits.fleetOwners.sectionWhatYouGet')}
            </h2>
            <ul className="mt-2 list-inside list-disc space-y-1 text-gray-700">
              <li>{t('benefits.fleetOwners.nationalView')}</li>
              <li>{t('benefits.fleetOwners.routeView')}</li>
              <li>{t('benefits.fleetOwners.planRoutes')}</li>
              <li>{t('benefits.fleetOwners.avoidEmpty')}</li>
              <li>{t('benefits.fleetOwners.oneAccount')}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">
              {t('benefits.fleetOwners.sectionCost')}
            </h2>
            <p className="mt-2 text-gray-700">
              {t('benefits.fleetOwners.pricingNote')}
            </p>
          </section>
        </div>

        <p className="mt-8">
          <Link
            to="/b2b"
            className="font-medium text-blue-600 underline active:text-blue-800"
          >
            {t('landing.fleetContactCta')}
          </Link>
        </p>

        <p className="mt-4 text-sm text-gray-700">
          {t('benefits.fleetOwners.alsoSeeStations')}{' '}
          <Link to="/benefits/station-owners" className="font-medium text-blue-600 underline active:text-blue-800">
            {t('benefits.stationOwners.title')}
          </Link>
          .
        </p>
      </main>
      <footer className="border-t border-gray-200 bg-white">
        <div className="mx-auto max-w-3xl px-4 py-4">
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-gray-700">
            <Link to="/landing" className="font-medium text-blue-600 underline">
              {t('benefits.fleetOwners.backToWebsite')}
            </Link>
            <Link to="/terms" className="font-medium text-blue-600 underline">
              {t('legal.termsOfService')}
            </Link>
            <Link to="/privacy" className="font-medium text-blue-600 underline">
              {t('legal.privacyPolicy')}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
