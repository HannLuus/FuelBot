import { useTranslation } from 'react-i18next'
import { FAQ_SECTIONS } from '@/config/helpContent'

type Props = {
  openIds: Set<string>
  onToggle: (anchorId: string) => void
}

export function FaqAccordion({ openIds, onToggle }: Props) {
  const { t } = useTranslation()

  return (
    <div className="space-y-8">
      {FAQ_SECTIONS.map((section) => (
        <section key={section.sectionId} aria-labelledby={`faq-group-${section.sectionId}`}>
          <h3 id={`faq-group-${section.sectionId}`} className="mb-3 text-base font-bold text-gray-900">
            {t(section.titleKey)}
          </h3>
          <div className="divide-y divide-gray-200 rounded-2xl border border-gray-200 bg-white">
            {section.items.map((item) => {
              const open = openIds.has(item.anchorId)
              return (
                <div key={item.anchorId} id={item.anchorId} className="scroll-mt-24">
                  <h4 className="sr-only">{t(item.qKey)}</h4>
                  <button
                    type="button"
                    aria-expanded={open}
                    className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left text-sm font-semibold text-gray-900 active:bg-gray-50"
                    onClick={() => onToggle(item.anchorId)}
                  >
                    <span className="min-w-0 flex-1">{t(item.qKey)}</span>
                    <span className="shrink-0 text-gray-500" aria-hidden>
                      {open ? '−' : '+'}
                    </span>
                  </button>
                  {open ? (
                    <div className="border-t border-gray-100 px-4 pb-3 pt-0">
                      <p className="pt-2 text-sm leading-relaxed text-gray-700">{t(item.aKey)}</p>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
