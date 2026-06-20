import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Mail } from 'lucide-react'
import { Button } from '@/components/ui/Button'

export function AdvertisePage() {
  const { t } = useTranslation()
  const email = t('landing.contactEmail')
  const mailtoHref = `mailto:${email}?subject=${encodeURIComponent(t('advertise.emailSubject'))}`

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2 text-gray-800 active:opacity-80">
            <img src="/FuelbotLogo.png" alt="" className="h-8 w-auto" />
            <span className="font-bold">{t('app.name')}</span>
          </Link>
          <Link
            to="/"
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-gray-700 active:bg-gray-100"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('legal.back')}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900">{t('advertise.title')}</h1>
        <p className="mt-2 text-gray-700">{t('advertise.subtitle')}</p>

        <div className="mt-8 space-y-6 text-gray-800">
          <section>
            <h2 className="text-lg font-semibold text-gray-900">{t('advertise.placementTitle')}</h2>
            <p className="mt-1 text-gray-700">{t('advertise.placementBody')}</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">{t('advertise.slotsTitle')}</h2>
            <p className="mt-1 text-gray-700">{t('advertise.slotsBody')}</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-gray-900">{t('advertise.specTitle')}</h2>
            <ul className="mt-2 list-inside list-disc space-y-1 text-gray-700">
              <li>{t('advertise.specAspect')}</li>
              <li>{t('advertise.specFormat')}</li>
              <li>{t('advertise.specContent')}</li>
              <li>{t('advertise.specStatic')}</li>
            </ul>
          </section>

          <section className="rounded-2xl border border-blue-200 bg-blue-50 p-6">
            <h2 className="text-lg font-semibold text-blue-900">{t('advertise.contactTitle')}</h2>
            <p className="mt-2 text-sm text-blue-900">{t('advertise.contactBody')}</p>
            <p className="mt-3 text-sm font-medium text-blue-900">{email}</p>
            <Button
              className="mt-4"
              onClick={() => {
                window.location.href = mailtoHref
              }}
            >
              <Mail className="h-4 w-4" />
              {t('advertise.emailCta')}
            </Button>
          </section>
        </div>
      </main>
    </div>
  )
}
