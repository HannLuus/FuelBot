import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Mail, Users, ImageIcon, MailCheck } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { AdvertiseVacantBillboard } from '@/components/landing/AdvertiseVacantBillboard'

export function AdvertisePage() {
  const { t } = useTranslation()
  const email = t('landing.contactEmail')
  const mailtoHref = `mailto:${email}?subject=${encodeURIComponent(t('advertise.emailSubject'))}`

  const perks = [
    { icon: Users, text: t('advertise.perkReach') },
    { icon: ImageIcon, text: t('advertise.perkPlacement') },
    { icon: MailCheck, text: t('advertise.perkQuote') },
  ]

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
        <section className="overflow-hidden rounded-2xl shadow-lg ring-1 ring-black/5">
          <div className="aspect-[16/7] w-full">
            <AdvertiseVacantBillboard variant="page" showEmail={false} />
          </div>
        </section>

        <h1 className="mt-6 text-2xl font-bold text-gray-900 sm:text-3xl">{t('advertise.title')}</h1>
        <p className="mt-2 text-base leading-relaxed text-gray-700 sm:text-lg">{t('advertise.subtitle')}</p>

        <ul className="mt-4 grid gap-3 sm:grid-cols-3">
          {perks.map(({ icon: Icon, text }) => (
            <li
              key={text}
              className="flex items-start gap-2 rounded-xl border border-gray-200 bg-white px-3 py-3 text-base text-gray-700"
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" aria-hidden />
              <span>{text}</span>
            </li>
          ))}
        </ul>

        <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900 sm:text-2xl">{t('advertise.audienceIntro')}</h2>
          <p className="mt-2 text-base leading-relaxed text-gray-700 sm:text-lg">{t('advertise.audienceBody')}</p>
          <p className="mt-3 text-base font-semibold text-gray-900 sm:text-lg">{t('advertise.audienceClose')}</p>
        </section>

        <section className="mt-6 rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white p-6 shadow-sm">
          <h2 className="text-2xl font-bold text-gray-900 sm:text-3xl">{t('advertise.contactTitle')}</h2>
          <p className="mt-2 text-base leading-relaxed text-gray-700 sm:text-lg">{t('advertise.contactBody')}</p>
          <p className="mt-3 text-sm text-gray-600 sm:text-base">{t('advertise.contactQuoteNote')}</p>
          <p className="mt-5 text-xs font-medium uppercase tracking-wide text-blue-800">
            {t('advertise.contactEmailLabel')}
          </p>
          <a href={mailtoHref} className="mt-1 block text-xl font-semibold text-blue-900 underline sm:text-2xl">
            {email}
          </a>
          <Button
            className="mt-5"
            onClick={() => {
              window.location.href = mailtoHref
            }}
          >
            <Mail className="h-4 w-4" />
            {t('advertise.emailCta')}
          </Button>
        </section>

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
        </div>
      </main>
    </div>
  )
}
