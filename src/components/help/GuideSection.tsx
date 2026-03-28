import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { GuideConfig } from '@/config/helpContent'

const PICKER_STEP_KEYS = [
  'report.help.pickerSteps.one',
  'report.help.pickerSteps.two',
  'report.help.pickerSteps.three',
  'report.help.pickerSteps.four',
] as const

const REPORT_STEP_KEYS = [
  'report.help.reportSteps.one',
  'report.help.reportSteps.two',
  'report.help.reportSteps.three',
  'report.help.reportSteps.four',
] as const

export function GuideSection({ guide }: { guide: GuideConfig }) {
  const { t } = useTranslation()

  if (guide.dryReportHelp) {
    return (
      <article
        id={guide.anchorId}
        className="scroll-mt-24 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
      >
        <h3 className="text-lg font-bold text-gray-900">{t(guide.titleKey)}</h3>
        <p className="mt-2 text-sm text-gray-700">{t(guide.prereqKey)}</p>
        <p className="mt-3 text-sm font-medium text-gray-800">{t('report.help.intro')}</p>
        <p className="mt-1 text-xs text-gray-600">{t('report.help.qualityReminder')}</p>

        <h4 className="mt-4 text-sm font-bold text-gray-900">{t('report.help.pickerTitle')}</h4>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-gray-700">
          {PICKER_STEP_KEYS.map((k) => (
            <li key={k}>{t(k)}</li>
          ))}
        </ol>

        <h4 className="mt-4 text-sm font-bold text-gray-900">{t('report.help.reportTitle')}</h4>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-gray-700">
          {REPORT_STEP_KEYS.map((k) => (
            <li key={k}>{t(k)}</li>
          ))}
        </ol>

        <p className="mt-3 text-sm text-gray-700">{t('help.guides.reporting.seeAlsoSheet')}</p>

        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-amber-900">
          {guide.troubleshootKeys.map((k) => (
            <li key={k}>{t(k)}</li>
          ))}
        </ul>
      </article>
    )
  }

  return (
    <article
      id={guide.anchorId}
      className="scroll-mt-24 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
    >
      <h3 className="text-lg font-bold text-gray-900">{t(guide.titleKey)}</h3>
      <p className="mt-2 text-sm text-gray-700">{t(guide.prereqKey)}</p>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-gray-700">
        {guide.stepKeys.map((k) => (
          <li key={k}>{t(k)}</li>
        ))}
      </ol>
      {guide.troubleshootKeys.length > 0 ? (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-amber-900">
          {guide.troubleshootKeys.map((k) => (
            <li key={k}>{t(k)}</li>
          ))}
        </ul>
      ) : null}
      {guide.relatedBenefitsPath && guide.relatedBenefitsLabelKey ? (
        <p className="mt-3 text-sm">
          <Link to={guide.relatedBenefitsPath} className="font-medium text-blue-600 underline">
            {t(guide.relatedBenefitsLabelKey)}
          </Link>
        </p>
      ) : null}
    </article>
  )
}
