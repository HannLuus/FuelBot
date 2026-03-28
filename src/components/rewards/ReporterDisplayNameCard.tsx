import { useTranslation } from 'react-i18next'
import type { User } from '@supabase/supabase-js'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { useReporterDisplayName } from '@/hooks/useReporterDisplayName'
import { REPORTER_DISPLAY_NAME_MAX } from '@/lib/reporterDisplayName'

export function ReporterDisplayNameCard({
  user,
  onSaved,
}: {
  user: User
  onSaved?: () => void
}) {
  const { t } = useTranslation()
  const {
    loadStatus,
    draft,
    setDraft,
    suggested,
    hasSavedRow,
    saving,
    removing,
    message,
    fieldError,
    applySuggestion,
    save,
    remove,
  } = useReporterDisplayName(user, { onSaved })

  const suggestionMatches =
    suggested.length > 0 && draft.trim().replace(/\s+/g, ' ') === suggested.trim().replace(/\s+/g, ' ')

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-900">{t('leaderboard.displayNameTitle')}</h2>
      <p className="mt-1 text-xs text-gray-600">{t('leaderboard.displayNameDescription')}</p>

      {loadStatus === 'loading' ? (
        <div className="mt-4 flex justify-center py-4">
          <Spinner />
        </div>
      ) : (
        <>
          <label htmlFor="reporter-display-name" className="mt-3 block text-xs font-medium text-gray-700">
            {t('leaderboard.displayNameLabel')}
          </label>
          <input
            id="reporter-display-name"
            type="text"
            maxLength={REPORTER_DISPLAY_NAME_MAX}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            autoComplete="nickname"
          />
          <p className="mt-1 text-xs text-gray-500">{t('leaderboard.displayNameHint')}</p>

          {fieldError === 'too_short' && (
            <p className="mt-2 text-xs font-medium text-red-700">{t('leaderboard.displayNameTooShort')}</p>
          )}
          {fieldError === 'too_long' && (
            <p className="mt-2 text-xs font-medium text-red-700">{t('leaderboard.displayNameTooLong')}</p>
          )}
          {fieldError === 'taken' && (
            <p className="mt-2 text-xs font-medium text-red-700">{t('leaderboard.displayNameTaken')}</p>
          )}
          {fieldError === 'save_failed' && (
            <p className="mt-2 text-xs font-medium text-red-700">{t('leaderboard.displayNameSaveFailed')}</p>
          )}
          {fieldError === 'remove_failed' && (
            <p className="mt-2 text-xs font-medium text-red-700">{t('leaderboard.displayNameRemoveFailed')}</p>
          )}
          {message === 'saved' && (
            <p className="mt-2 text-xs font-semibold text-green-700">{t('leaderboard.displayNameSaved')}</p>
          )}
          {message === 'removed' && (
            <p className="mt-2 text-xs font-semibold text-green-700">{t('leaderboard.displayNameRemoved')}</p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" loading={saving} onClick={() => void save()}>
              {t('leaderboard.displayNameSave')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={!suggested || suggestionMatches}
              onClick={applySuggestion}
            >
              {t('leaderboard.displayNameUseSuggested')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!hasSavedRow}
              loading={removing}
              onClick={() => void remove()}
            >
              {t('leaderboard.displayNameRemove')}
            </Button>
          </div>
        </>
      )}
    </section>
  )
}
