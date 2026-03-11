import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Truck, CheckCircle2, Upload, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { useB2BEntitlements } from '@/hooks/useB2BEntitlements'
import { usePaymentConfig } from '@/hooks/usePaymentConfig'
import { useAuthStore } from '@/stores/authStore'
import { formatMmk } from '@/lib/subscriptionTiers'

const BUCKET = 'b2b-payment-screenshots'
const ANNUAL_PRICE = Number(import.meta.env.VITE_STATION_SUBSCRIPTION_ANNUAL_MMK ?? '120000')

export function B2BPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { routeAccessValidUntil, loading: entLoading, refresh } = useB2BEntitlements()

  const [paymentMethod, setPaymentMethod] = useState('KBZ_PAY')
  const [paymentReference, setPaymentReference] = useState('')
  const [screenshotPath, setScreenshotPath] = useState<string | null>(null)
  const [uploadingScreenshot, setUploadingScreenshot] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const paymentConfig = usePaymentConfig()
  const paymentInstructions = paymentConfig.payment_instructions ?? ''
  const paymentQrUrl = paymentConfig.payment_qr_url ?? ''
  const paymentPhoneWavePay = (paymentConfig.payment_phone_wavepay ?? '').trim()
  const paymentPhoneKpay = (paymentConfig.payment_phone_kpay ?? '').trim()

  if (!user) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center">
        <Truck className="mb-4 h-12 w-12 text-gray-400" />
        <h2 className="text-lg font-semibold text-gray-900">{t('b2b.title')}</h2>
        <p className="mt-2 text-sm text-gray-600">{t('b2b.signInRequired')}</p>
        <Button className="mt-4" onClick={() => navigate('/auth?redirect=/b2b')}>
          {t('auth.signIn')}
        </Button>
      </div>
    )
  }

  if (entLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    )
  }

  if (routeAccessValidUntil) {
    return (
      <div className="flex h-full flex-col">
        <div className="shrink-0 border-b border-gray-100 bg-white px-4 py-3">
          <h1 className="text-lg font-bold text-gray-900">{t('b2b.title')}</h1>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="mx-auto max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100">
                <CheckCircle2 className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-green-600">{t('b2b.activeStatus')}</p>
                <p className="text-gray-700 text-sm">
                  {t('b2b.validUntil', { date: routeAccessValidUntil.toLocaleDateString() })}
                </p>
              </div>
            </div>
            <Button className="w-full" onClick={() => navigate('/home')}>
              {t('b2b.goToMap')}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !user) return
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    if (!['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
      setError(t('b2b.invalidImageType'))
      return
    }
    setError(null)
    setUploadingScreenshot(true)
    try {
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`
      const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: file.type,
        upsert: false,
      })
      if (uploadErr) throw uploadErr
      setScreenshotPath(path)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'))
    } finally {
      setUploadingScreenshot(false)
      e.target.value = ''
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    setSuccess(false)
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('b2b-subscribe', {
        body: {
          payment_method: paymentMethod,
          payment_reference: paymentReference.trim(),
          screenshot_path: screenshotPath || undefined,
        },
      })
      if (fnErr) throw fnErr
      if (data?.error) throw new Error(data.error)
      setSuccess(true)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-gray-100 bg-white px-4 py-3">
        <h1 className="text-lg font-bold text-gray-900">{t('b2b.title')}</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <p className="text-sm text-gray-700">{t('b2b.description')}</p>

        {/* Pricing — same style as Operator tiers section */}
        <section className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
          <h2 className="text-sm font-bold text-gray-900 mb-3">{t('landing.perYear')}</h2>
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
            <p className="text-lg font-bold text-blue-900">{formatMmk(ANNUAL_PRICE)} / {t('landing.perYear')}</p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-blue-800">
              <li>{t('b2b.allRoutesAccess')}</li>
              <li>{t('b2b.oneAccountPerSub')}</li>
            </ul>
          </div>
        </section>

        {/* Pay via — QR + phone prominent like Operator */}
        <section className="rounded-2xl border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-bold text-gray-900 mb-3">{t('b2b.payVia')}</h2>
          {paymentInstructions ? (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
              {paymentInstructions}
            </div>
          ) : (
            <p className="text-xs text-gray-700">{t('b2b.contactForPayment')}</p>
          )}
          {paymentQrUrl ? (
            <div className="mt-3">
              <p className="text-xs font-medium text-gray-700 mb-1">QR code</p>
              <img src={paymentQrUrl} alt="Payment QR" className="h-40 w-40 rounded border border-gray-200 object-cover" />
            </div>
          ) : null}
          {(paymentPhoneWavePay || paymentPhoneKpay) ? (
            <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
              {paymentPhoneWavePay ? (
                <p>WavePay: <a href={`tel:${paymentPhoneWavePay.replace(/\s/g, '')}`} className="font-semibold text-blue-600 underline">{paymentPhoneWavePay}</a></p>
              ) : null}
              {paymentPhoneKpay ? (
                <p className="mt-1">KPay / KBZ Pay: <a href={`tel:${paymentPhoneKpay.replace(/\s/g, '')}`} className="font-semibold text-blue-600 underline">{paymentPhoneKpay}</a></p>
              ) : null}
            </div>
          ) : null}
        </section>

        {success ? (
          <section className="rounded-2xl border border-green-200 bg-green-50 p-4 text-green-800">
            <p className="font-semibold">{t('b2b.successTitle')}</p>
            <p className="mt-1 text-sm">{t('b2b.successBody')}</p>
            <Button className="mt-4 w-full" onClick={() => navigate('/home')}>
              {t('b2b.goToMap')}
            </Button>
          </section>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <section className="rounded-2xl border border-gray-200 bg-white p-4">
              <h2 className="text-sm font-bold text-gray-900 mb-3">{t('b2b.paymentDetails')}</h2>

              <div className="space-y-3">
                <div>
                  <label htmlFor="b2b-payment-method" className="mb-1.5 block text-xs font-medium text-gray-700">
                    {t('admin.paymentMethod')}
                  </label>
                  <select
                    id="b2b-payment-method"
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="KBZ_PAY">KBZ Pay</option>
                    <option value="WAVEPAY">WavePay</option>
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="b2b-payment-ref" className="mb-1.5 block text-xs font-medium text-gray-700">
                    {t('admin.paymentReference')} *
                  </label>
                  <input
                    id="b2b-payment-ref"
                    type="text"
                    required
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                    placeholder="e.g. Transaction ID or last 4 digits"
                    className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {/* Optional screenshot upload — for admin/bot review */}
                <div>
                  <p className="mb-1.5 text-xs font-medium text-gray-700">{t('b2b.uploadScreenshot')}</p>
                  <p className="mb-2 text-[11px] text-gray-700">{t('b2b.uploadScreenshotHint')}</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={handleFileChange}
                    aria-label={t('b2b.uploadScreenshot')}
                  />
                  {screenshotPath ? (
                    <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                      <span className="text-sm text-gray-700 truncate flex-1">{t('b2b.screenshotUploaded')}</span>
                      <button
                        type="button"
                        onClick={() => setScreenshotPath(null)}
                        className="shrink-0 rounded p-1 text-gray-700 hover:bg-gray-200"
                        aria-label={t('b2b.removeScreenshot')}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={uploadingScreenshot}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {uploadingScreenshot ? <Spinner className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
                      {uploadingScreenshot ? t('b2b.uploadingScreenshot') : t('b2b.uploadScreenshot')}
                    </Button>
                  )}
                </div>
              </div>
            </section>

            {error && (
              <p className="text-sm font-medium text-red-600">{error}</p>
            )}

            <Button
              type="submit"
              variant="primary"
              className="w-full"
              loading={submitting}
              disabled={!paymentReference.trim() || submitting}
            >
              {t('b2b.submitPayment')}
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
