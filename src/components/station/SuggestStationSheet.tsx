import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import { X, Lightbulb } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/ui/Button'

interface Props {
  open: boolean
  onClose: () => void
}

export function SuggestStationSheet({ open, onClose }: Props) {
  const { t } = useTranslation()
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()

  const [name, setName] = useState('')
  const [city, setCity] = useState('')
  const [address, setAddress] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nameError, setNameError] = useState(false)
  const [cityError, setCityError] = useState(false)

  function reset() {
    setName('')
    setCity('')
    setAddress('')
    setNote('')
    setSubmitting(false)
    setSuccess(false)
    setError(null)
    setNameError(false)
    setCityError(false)
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setNameError(false)
    setCityError(false)
    setError(null)

    if (!user) {
      setError(t('suggest.signInRequired'))
      return
    }

    let valid = true
    if (!name.trim()) { setNameError(true); valid = false }
    if (!city.trim()) { setCityError(true); valid = false }
    if (!valid) return

    setSubmitting(true)
    try {
      const { error: insertError } = await supabase.from('station_suggestions').insert({
        name: name.trim(),
        city: city.trim(),
        address: address.trim() || null,
        note: note.trim() || null,
        suggested_by: user.id,
      })
      if (insertError) throw insertError

      // Fire-and-forget admin notification (best-effort)
      void supabase.functions.invoke('notify-admin', {
        body: {
          kind: 'PENDING_SUGGESTION',
          station_name: name.trim(),
          suggestion_city: city.trim(),
        },
      })

      setSuccess(true)
    } catch {
      setError(t('suggest.error'))
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        role="button"
        tabIndex={0}
        aria-label={t('common.close')}
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
        onClick={handleClose}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClose() }
        }}
      />

      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('suggest.title')}
        className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl bg-white pb-safe shadow-2xl"
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-gray-300" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-3 pt-1">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-amber-500 shrink-0" />
            <h2 className="text-base font-bold text-gray-900">{t('suggest.title')}</h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-gray-100 active:bg-gray-200"
            aria-label={t('common.close')}
          >
            <X className="h-5 w-5 text-gray-600" />
          </button>
        </div>

        <div className="px-5 pb-6">
          {success ? (
            <div className="py-6 text-center">
              <p className="text-2xl">🎉</p>
              <p className="mt-2 text-sm font-medium text-gray-800">{t('suggest.success')}</p>
              <Button size="sm" variant="secondary" className="mt-4 w-full" onClick={handleClose}>
                {t('common.close')}
              </Button>
            </div>
          ) : (
            <form onSubmit={(e) => { void handleSubmit(e) }} noValidate>
              <p className="mb-4 text-sm text-gray-700">{t('suggest.intro')}</p>

              {!user && (
                <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="text-sm text-amber-900">{t('suggest.signInRequired')}</p>
                  <Button
                    type="button"
                    size="sm"
                    className="mt-2"
                    onClick={() => {
                      handleClose()
                      navigate(`/auth?redirect=${encodeURIComponent(location.pathname)}`)
                    }}
                  >
                    {t('suggest.signInCta')}
                  </Button>
                </div>
              )}

              {/* Name */}
              <div className="mb-3">
                <label className="mb-1 block text-xs font-semibold text-gray-700">
                  {t('station.name')} *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('suggest.namePlaceholder')}
                  className={`w-full rounded-xl border px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 ${nameError ? 'border-red-400' : 'border-gray-300'}`}
                />
                {nameError && (
                  <p className="mt-1 text-xs text-red-500">{t('suggest.nameRequired')}</p>
                )}
              </div>

              {/* City */}
              <div className="mb-3">
                <label className="mb-1 block text-xs font-semibold text-gray-700">
                  {t('station.city')} *
                </label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder={t('suggest.cityPlaceholder')}
                  className={`w-full rounded-xl border px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 ${cityError ? 'border-red-400' : 'border-gray-300'}`}
                />
                {cityError && (
                  <p className="mt-1 text-xs text-red-500">{t('suggest.cityRequired')}</p>
                )}
              </div>

              {/* Address */}
              <div className="mb-3">
                <label className="mb-1 block text-xs font-semibold text-gray-700">
                  {t('station.address')}
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder={t('suggest.addressPlaceholder')}
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Note */}
              <div className="mb-4">
                <label className="mb-1 block text-xs font-semibold text-gray-700">
                  {t('common.note')}
                </label>
                <textarea
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t('suggest.notePlaceholder')}
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none"
                />
              </div>

              {error && (
                <p className="mb-3 rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</p>
              )}

              <Button
                type="submit"
                variant="primary"
                size="md"
                loading={submitting}
                disabled={!user}
                className="w-full"
              >
                {submitting ? t('suggest.submitting') : t('suggest.submit')}
              </Button>
            </form>
          )}
        </div>
      </div>
    </>
  )
}
