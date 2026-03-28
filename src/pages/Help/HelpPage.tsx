import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft } from 'lucide-react'
import { GUIDE_CONFIG, FAQ_SECTIONS, isHelpGuideSlug } from '@/config/helpContent'
import { FaqAccordion } from '@/components/help/FaqAccordion'
import { GuideSection } from '@/components/help/GuideSection'
import { Button } from '@/components/ui/Button'

function scrollToId(id: string) {
  window.requestAnimationFrame(() => {
    window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 80)
  })
}

export function HelpPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const [openFaqIds, setOpenFaqIds] = useState<Set<string>>(() => new Set())
  const [toast, setToast] = useState<string | null>(null)

  const toggleFaq = useCallback((id: string) => {
    setOpenFaqIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  useEffect(() => {
    document.title = t('help.meta.title')
    return () => {
      document.title = t('app.name')
    }
  }, [t])

  useEffect(() => {
    const guideParam = searchParams.get('guide')
    if (guideParam && !isHelpGuideSlug(guideParam)) {
      queueMicrotask(() => {
        setToast(t('help.guideNotFound'))
        navigate({ pathname: '/help', search: '' }, { replace: true })
      })
      return
    }
    if (guideParam && isHelpGuideSlug(guideParam)) {
      const cfg = GUIDE_CONFIG.find((g) => g.slug === guideParam)
      if (cfg) {
        navigate({ pathname: '/help', hash: `#${cfg.anchorId}`, search: '' }, { replace: true })
      }
    }
  }, [searchParams, navigate, t])

  useEffect(() => {
    const hash = location.hash.slice(1)
    if (!hash) return

    const faqIds = new Set<string>()
    for (const sec of FAQ_SECTIONS) {
      for (const it of sec.items) {
        if (it.anchorId === hash) faqIds.add(it.anchorId)
      }
    }
    queueMicrotask(() => {
      if (faqIds.size > 0) {
        setOpenFaqIds((prev) => new Set([...prev, ...faqIds]))
      }
      scrollToId(hash)
    })
  }, [location.hash])

  useEffect(() => {
    if (!toast) return
    const tid = window.setTimeout(() => setToast(null), 4000)
    return () => window.clearTimeout(tid)
  }, [toast])

  return (
    <div className="min-h-screen bg-gray-50">
      <a
        href="#section-faq"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:shadow"
      >
        {t('help.skipToFaq')}
      </a>
      <a
        href="#section-guides"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-16 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:shadow"
      >
        {t('help.skipToGuides')}
      </a>

      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <Button size="sm" variant="secondary" type="button" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
            {t('common.close')}
          </Button>
          <h1 className="text-lg font-semibold text-gray-900">{t('help.pageTitle')}</h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        {toast ? (
          <p className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status">
            {toast}
          </p>
        ) : null}

        <p className="text-sm text-gray-700">{t('help.pageSubtitle')}</p>
        <p className="mt-2 text-xs text-gray-600">{t('help.legalNote')}</p>

        <section id="section-faq" className="mt-8">
          <h2 className="mb-4 text-xl font-bold text-gray-900">{t('help.sectionFaq')}</h2>
          <FaqAccordion openIds={openFaqIds} onToggle={toggleFaq} />
        </section>

        <section id="section-guides" className="mt-12">
          <h2 className="mb-4 text-xl font-bold text-gray-900">{t('help.sectionGuides')}</h2>
          <div className="space-y-6">
            {GUIDE_CONFIG.map((g) => (
              <GuideSection key={g.slug} guide={g} />
            ))}
          </div>
        </section>

        <section className="mt-10 rounded-2xl border border-blue-200 bg-blue-50 p-4">
          <h2 className="text-base font-bold text-blue-950">{t('help.stillStuck')}</h2>
          <p className="mt-1 text-sm text-blue-900">{t('help.contactCta')}</p>
          <Link to="/contact" className="mt-2 inline-block text-sm font-semibold text-blue-700 underline">
            {t('landing.footerContact')}
          </Link>
        </section>
      </main>

      <footer className="border-t border-gray-200 bg-white">
        <div className="mx-auto max-w-3xl px-4 py-4">
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-gray-700">
            <Link to="/landing" className="font-medium text-blue-600 underline">
              {t('help.footerWebsite')}
            </Link>
            <Link to="/terms" className="font-medium text-blue-600 underline">
              {t('legal.termsOfService')}
            </Link>
            <Link to="/privacy" className="font-medium text-blue-600 underline">
              {t('legal.privacyPolicy')}
            </Link>
            <Link to="/contact" className="font-medium text-blue-600 underline">
              {t('landing.footerContact')}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
