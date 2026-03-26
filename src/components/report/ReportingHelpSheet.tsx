import { useTranslation } from 'react-i18next'
import { CircleHelp, X } from 'lucide-react'

type HelpContext = 'picker' | 'report'

interface ReportingHelpSheetProps {
  open: boolean
  context: HelpContext
  onClose: () => void
}

export function ReportingHelpSheet({ open, context, onClose }: ReportingHelpSheetProps) {
  const { t } = useTranslation()

  if (!open) return null

  const titleKey = context === 'picker' ? 'report.help.pickerTitle' : 'report.help.reportTitle'
  const stepsPrefix = context === 'picker' ? 'report.help.pickerSteps' : 'report.help.reportSteps'

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-label={t('common.close')}
        className="fixed inset-0 z-[1100] bg-black/40"
        onClick={onClose}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onClose()
          }
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t(titleKey)}
        className="fixed bottom-0 left-0 right-0 z-[1200] rounded-t-3xl bg-white pb-safe shadow-2xl"
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-gray-300" />
        </div>

        <div className="flex items-center justify-between px-5 pb-2 pt-1">
          <div className="flex items-center gap-2">
            <CircleHelp className="h-5 w-5 shrink-0 text-blue-600" />
            <h2 className="text-base font-bold text-gray-900">{t(titleKey)}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-gray-100 active:bg-gray-200"
            aria-label={t('common.close')}
          >
            <X className="h-5 w-5 text-gray-700" />
          </button>
        </div>

        <div className="max-h-[55vh] overflow-y-auto px-5 pb-6">
          <p className="mb-3 text-sm text-gray-700">{t('report.help.intro')}</p>
          <ol className="space-y-2 pl-5 text-sm text-gray-800">
            <li>{t(`${stepsPrefix}.one`)}</li>
            <li>{t(`${stepsPrefix}.two`)}</li>
            <li>{t(`${stepsPrefix}.three`)}</li>
            <li>{t(`${stepsPrefix}.four`)}</li>
          </ol>
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {t('report.help.qualityReminder')}
          </p>
        </div>
      </div>
    </>
  )
}
