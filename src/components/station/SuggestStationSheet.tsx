import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router-dom'
import { X, Lightbulb, MapPin } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/ui/Button'

interface Props {
  open: boolean
  onClose: () => void
  /** When suggesting from the map page: location picked by tapping the map */
  pickedLat?: number | null
  pickedLng?: number | null
  onClearLocation?: () => void
  /** When true, no full-screen backdrop so the map stays clickable to set location */
  hideBackdrop?: boolean
}

export function SuggestStationSheet({ open, onClose, pickedLat, pickedLng, onClearLocation, hideBackdrop }: Props) {
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
  const [sheetEntered, setSheetEntered] = useState(false)
  /** On map page: step 1 = pick location (compact bar), step 2 = full form */
  const [mapStep, setMapStep] = useState<'pick' | 'details'>('pick')

  useEffect(() => {
    if (open) {
      setSheetEntered(false)
      if (hideBackdrop) setMapStep('pick')
      const t = requestAnimationFrame(() => {
        requestAnimationFrame(() => setSheetEntered(true))
      })
      return () => cancelAnimationFrame(t)
    }
    setSheetEntered(false)
  }, [open, hideBackdrop])

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
        lat: pickedLat ?? null,
        lng: pickedLng ?? null,
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

  const hasLocation = pickedLat != null && pickedLng != null

  return (
    <>
      {/* Backdrop — omit when hideBackdrop so user can tap the map to set location */}
      {!hideBackdrop && (
        <div
          role="button"
          tabIndex={0}
          aria-label={t('common.close')}
          className="fixed inset-0 z-[1100] bg-black/40"
          onClick={handleClose}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClose() }
          }}
        />
      )}

      {/* Sheet — compact when map step is 'pick', max height when 'details' on map */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('suggest.title')}
        className={`fixed bottom-0 left-0 right-0 z-[1200] flex flex-col rounded-t-3xl bg-white pb-safe shadow-2xl transition-transform duration-200 ease-out ${sheetEntered ? 'translate-y-0' : 'translate-y-full'} ${hideBackdrop && mapStep === 'details' ? 'max-h-[55vh]' : ''}`}
      >
        {/* Drag handle */}
        <div className="flex shrink-0 justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-gray-300" />
        </div>

        {/* Header */}
        <div className="flex shrink-0 items-center justify-between px-5 pb-3 pt-1">
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

        {/* Step 1 (map only): compact bar — two clear actions: Clear location / Close, and Continue */}
        {hideBackdrop && mapStep === 'pick' && (
          <div className="shrink-0 px-5 pb-6">
            <p className="mb-3 flex items-center gap-2 text-sm text-gray-700">
              <MapPin className="h-4 w-4 text-amber-600 shrink-0" />
              {t('suggest.tapMapToSetLocation')}
            </p>
            <div className="flex gap-3">
              <Button
                type="button"
                variant="secondary"
                size="md"
                className="flex-1"
                onClick={() => {
                  if (hasLocation && onClearLocation) onClearLocation()
                  else handleClose()
                }}
              >
                {hasLocation ? t('suggest.clearLocation') : t('common.close')}
              </Button>
              <Button
                type="button"
                variant="primary"
                size="md"
                className="flex-1"
                disabled={!hasLocation}
                onClick={() => setMapStep('details')}
              >
                {t('suggest.continueToDetails')}
              </Button>
            </div>
          </div>
        )}

        {/* Step 2 or non-map: full form — scrollable when capped height */}
        <div className={`min-h-0 px-5 pb-6 ${hideBackdrop && mapStep === 'details' ? 'flex-1 overflow-y-auto' : ''} ${!(hideBackdrop && mapStep === 'pick') ? '' : 'hidden'}`}>
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

              {(hideBackdrop || hasLocation) && (
                <div className="mb-4 flex flex-col gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                  {hasLocation ? (
                    <>
                      <p className="flex items-center gap-2 text-sm font-medium text-gray-900">
                        <MapPin className="h-4 w-4 text-green-600 shrink-0" />
                        {t('suggest.locationSet')}: {pickedLat!.toFixed(5)}, {pickedLng!.toFixed(5)}
                      </p>
                      {onClearLocation && (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            if (hideBackdrop) setMapStep('pick')
                            onClearLocation()
                          }}
                        >
                          {t('suggest.changeLocation')}
                        </Button>
                      )}
                    </>
                  ) : (
                    <p className="flex items-center gap-2 text-sm text-gray-700">
                      <MapPin className="h-4 w-4 text-amber-600 shrink-0" />
                      {t('suggest.tapMapToSetLocation')}
                    </p>
                  )}
                </div>
              )}

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
