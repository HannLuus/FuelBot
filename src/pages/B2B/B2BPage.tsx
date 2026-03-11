import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Truck, CheckCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { useB2BEntitlements } from '@/hooks/useB2BEntitlements'
import { useAuthStore } from '@/stores/authStore'
import { formatMmk } from '@/lib/subscriptionTiers'

const ANNUAL_PRICE = Number(import.meta.env.VITE_STATION_SUBSCRIPTION_ANNUAL_MMK ?? '120000')

export function B2BPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { routeAccessValidUntil, loading: entLoading, refresh } = useB2BEntitlements()

  const [paymentMethod, setPaymentMethod] = useState('KBZ_PAY')
  const [paymentReference, setPaymentReference] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Payment instruction env vars (shared with operator)
  const paymentInstructions = import.meta.env.VITE_PAYMENT_INSTRUCTIONS
  const paymentQrUrl = import.meta.env.VITE_PAYMENT_QR_URL
  const paymentPhoneWavePay = import.meta.env.VITE_PAYMENT_PHONE_WAVEPAY?.trim() || ''
  const paymentPhoneKpay = import.meta.env.VITE_PAYMENT_PHONE_KPAY?.trim() || ''

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

  // Already subscribed?
  if (routeAccessValidUntil) {
    return (
      <div className="mx-auto max-w-lg p-4 pb-24 md:p-6">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100">
              <CheckCircle2 className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{t('b2b.title')}</h1>
              <p className="text-sm font-medium text-green-600">{t('b2b.activeStatus')}</p>
            </div>
          </div>
          <p className="text-gray-700 text-sm">
            {t('b2b.validUntil', { date: routeAccessValidUntil.toLocaleDateString() })}
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <Button onClick={() => navigate('/home')}>
              {t('b2b.goToMap')}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // Not subscribed: show purchase form
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
    <div className="mx-auto max-w-lg p-4 pb-24 md:p-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600">
            <Truck className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">{t('b2b.title')}</h1>
        </div>
        
        <p className="text-sm text-gray-700">{t('b2b.description')}</p>
        
        <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-4">
          <p className="text-lg font-bold text-blue-900">{formatMmk(ANNUAL_PRICE)} / {t('landing.perYear')}</p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-blue-800">
            <li>{t('b2b.allRoutesAccess')}</li>
            <li>{t('b2b.oneAccountPerSub')}</li>
          </ul>
        </div>

        {success ? (
          <div className="mt-6 rounded-xl border border-green-200 bg-green-50 p-4 text-green-800">
            <p className="font-semibold">{t('b2b.successTitle')}</p>
            <p className="mt-1 text-sm">{t('b2b.successBody')}</p>
            <Button className="mt-4 w-full" onClick={() => navigate('/home')}>
              {t('b2b.goToMap')}
            </Button>
          </div>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 space-y-5">
            <div>
              <h2 className="text-base font-semibold text-gray-900">{t('operator.payVia')}</h2>
              {paymentInstructions ? (
                <div className="mt-2 rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
                  {paymentInstructions}
                </div>
              ) : null}

              {paymentQrUrl ? (
                <img src={paymentQrUrl} alt="Payment QR" className="mt-3 h-40 w-40 rounded border border-gray-200 object-cover" />
              ) : null}

              {(paymentPhoneWavePay || paymentPhoneKpay) ? (
                <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
                  {paymentPhoneWavePay ? (
                    <p>WavePay: <a href={`tel:${paymentPhoneWavePay.replace(/\s/g, '')}`} className="font-semibold text-blue-600 underline">{paymentPhoneWavePay}</a></p>
                  ) : null}
                  {paymentPhoneKpay ? (
                    <p className="mt-1">KPay: <a href={`tel:${paymentPhoneKpay.replace(/\s/g, '')}`} className="font-semibold text-blue-600 underline">{paymentPhoneKpay}</a></p>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="pt-2">
              <label htmlFor="b2b-payment-method" className="mb-1.5 block text-sm font-medium text-gray-700">
                {t('admin.paymentMethod')}
              </label>
              <select
                id="b2b-payment-method"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="KBZ_PAY">KBZ Pay</option>
                <option value="WAVE_PAY">WavePay</option>
                <option value="BANK_TRANSFER">Bank Transfer</option>
              </select>
            </div>

            <div>
              <label htmlFor="b2b-payment-ref" className="mb-1.5 block text-sm font-medium text-gray-700">
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
