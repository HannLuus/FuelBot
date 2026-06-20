import { Megaphone, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface AdvertiseVacantBillboardProps {
  variant?: 'carousel' | 'page'
  showEmail?: boolean
}

export function AdvertiseVacantBillboard({
  variant = 'carousel',
  showEmail = true,
}: AdvertiseVacantBillboardProps) {
  const { t } = useTranslation()
  const isPage = variant === 'page'
  const email = t('landing.contactEmail')

  return (
    <div
      className={`relative h-full w-full overflow-hidden bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-900 ${
        isPage ? 'min-h-[220px]' : ''
      }`}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.9) 1px, transparent 0)',
          backgroundSize: '22px 22px',
        }}
      />
      <div className="pointer-events-none absolute -left-16 top-1/2 h-48 w-48 -translate-y-1/2 rounded-full bg-amber-400/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-sky-400/25 blur-3xl" />

      <div
        className={`relative flex h-full w-full items-center ${
          isPage ? 'gap-6 px-6 py-8 sm:px-10' : 'px-4 py-3 sm:gap-5 sm:px-6 sm:py-4'
        }`}
      >
        <div className={`min-w-0 flex-1 ${isPage ? 'max-w-xl' : ''}`}>
          <div
            className={`inline-flex items-center gap-1.5 rounded-full border border-amber-300/40 bg-amber-400/15 font-semibold uppercase tracking-wide text-amber-100 ${
              isPage ? 'px-3 py-1 text-xs sm:text-sm' : 'px-2.5 py-1 text-[11px] sm:text-xs'
            }`}
          >
            <Sparkles className={isPage ? 'h-4 w-4' : 'h-3.5 w-3.5'} aria-hidden />
            {t('landing.advertiseVacantBadge')}
          </div>

          <h2
            className={`font-extrabold leading-[1.15] tracking-tight text-white ${
              isPage ? 'mt-3 text-3xl sm:text-4xl' : 'mt-1.5 text-[1.35rem] sm:mt-2 sm:text-3xl'
            }`}
          >
            {t('landing.advertiseVacantHeadline')}
          </h2>

          <p
            className={`mt-1 font-medium leading-snug text-blue-100 ${
              isPage ? 'text-base sm:text-lg' : 'text-sm sm:text-base'
            }`}
          >
            {t('landing.advertiseVacantHook')}
          </p>

          {isPage && (
            <p className="mt-1 text-sm text-blue-200/90 sm:text-base">{t('landing.advertiseVacantSubline')}</p>
          )}

          <div
            className={`flex flex-wrap items-center gap-2 ${isPage ? 'mt-4 gap-3' : 'mt-2 sm:mt-3'}`}
          >
            <span
              className={`inline-flex items-center rounded-full bg-amber-400 font-bold text-slate-950 shadow-lg shadow-amber-500/30 ${
                isPage ? 'px-5 py-2.5 text-base' : 'px-4 py-1.5 text-sm sm:px-5 sm:py-2 sm:text-base'
              }`}
            >
              {t('landing.advertiseVacantCtaButton')}
            </span>
            <span
              className={`rounded-full border border-white/20 bg-white/10 font-medium text-white/90 ${
                isPage ? 'px-3 py-1.5 text-sm' : 'px-2.5 py-1 text-xs sm:text-sm'
              }`}
            >
              {t('landing.advertiseVacantQuote')}
            </span>
          </div>

          {showEmail && (
            <p
              className={`font-semibold text-white underline decoration-amber-300/80 underline-offset-2 ${
                isPage ? 'mt-4 text-lg sm:text-xl' : 'mt-1.5 text-sm sm:mt-2 sm:text-base'
              }`}
            >
              {email}
            </p>
          )}
        </div>

        <div
          className={`relative shrink-0 ${
            isPage ? 'hidden w-[38%] sm:block' : 'hidden w-[34%] max-w-[180px] sm:block'
          }`}
        >
          <div
            className={`relative rotate-1 rounded-xl border-2 border-dashed border-amber-300/70 bg-gradient-to-br from-white/15 to-white/5 shadow-2xl backdrop-blur-sm ${
              isPage ? 'p-5' : 'p-2 sm:p-3'
            }`}
          >
            <div
              className={`flex flex-col items-center justify-center rounded-lg border border-white/20 bg-slate-900/40 text-center ${
                isPage ? 'gap-3 px-4 py-8' : 'gap-1 px-2 py-4 sm:gap-2 sm:py-5'
              }`}
            >
              <div
                className={`flex items-center justify-center rounded-full bg-amber-400/20 text-amber-200 ${
                  isPage ? 'h-14 w-14' : 'h-8 w-8 sm:h-10 sm:w-10'
                }`}
              >
                <Megaphone
                  className={isPage ? 'h-7 w-7' : 'h-4 w-4 sm:h-5 sm:w-5'}
                  aria-hidden
                />
              </div>
              <p
                className={`font-bold uppercase tracking-wider text-white/90 ${
                  isPage ? 'text-sm' : 'text-[8px] sm:text-[10px]'
                }`}
              >
                {t('landing.advertiseVacantBrandPlaceholder')}
              </p>
              <p
                className={`text-white/60 ${isPage ? 'text-xs' : 'hidden text-[8px] sm:block sm:text-[9px]'}`}
              >
                {t('landing.advertiseVacantSpecHint')}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
