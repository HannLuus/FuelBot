import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Truck, CheckCircle2, Upload, X, Clock3 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { useB2BEntitlements } from '@/hooks/useB2BEntitlements'
import { useB2BPricing, type B2BDurationMonths, quoteB2BPrice } from '@/hooks/useB2BPricing'
import { usePaymentConfig } from '@/hooks/usePaymentConfig'
import { useAuthStore } from '@/stores/authStore'
import { formatMmk } from '@/lib/subscriptionTiers'

const BUCKET = 'b2b-payment-screenshots'
const DURATION_OPTIONS: B2BDurationMonths[] = [3, 6, 12]

interface PendingReviewRow {
  created_at: string
  duration_months: number | null
}

export function B2BPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { routeAccessValidUntil, loading: entLoading, refresh } = useB2BEntitlements()
  const { config: pricingConfig, loading: pricingLoading } = useB2BPricing()
  const {
    config: paymentConfig,
    loading: paymentConfigLoading,
    error: paymentConfigError,
  } = usePaymentConfig()

  const [durationMonths, setDurationMonths] = useState<B2BDurationMonths>(3)
  const [paymentReference, setPaymentReference] = useState('')
  const [screenshotPath, setScreenshotPath] = useState<string | null>(null)
  const [uploadingScreenshot, setUploadingScreenshot] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingReview, setPendingReview] = useState<PendingReviewRow | null>(null)
  const [pendingLoading, setPendingLoading] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const paymentInstructions = paymentConfig.payment_instructions ?? ''
  const paymentQrUrl = paymentConfig.payment_qr_url ?? ''
  const paymentPhoneKpay = (paymentConfig.payment_phone_kpay ?? '').trim()

  const refreshPendingReview = useCallback(async () => {
    if (!user?.id) {
      setPendingReview(null)
      setPendingLoading(false)
      return
    }

    setPendingLoading(true)
    const { data, error: pendingErr } = await supabase
      .from('b2b_subscriptions')
      .select('created_at, duration_months')
      .eq('user_id', user.id)
      .eq('status', 'PENDING')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!pendingErr && data) {
      setPendingReview(data)
    } else {
      setPendingReview(null)
    }
    setPendingLoading(false)
  }, [user?.id])

  useEffect(() => {
    void refreshPendingReview()
  }, [refreshPendingReview])

  if (!user) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center">
        <Truck className="mb-4 h-12 w-12 text-gray-400" />
        <h2 className="text-lg font-semibold text-gray-900">{t('b2b.title')}</h2>
        <p className="mt-2 text-sm text-gray-700">{t('b2b.signInRequired')}</p>
        <Button className="mt-4" onClick={() => navigate('/auth?redirect=/b2b')}>
          {t('auth.signIn')}
        </Button>
      </div>
    )
  }

  if (entLoading || pendingLoading) {
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
                <p className="text-sm text-gray-700">
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

  if (pendingReview) {
    return (
      <div className="flex h-full flex-col">
        <div className="shrink-0 border-b border-gray-100 bg-white px-4 py-3">
          <h1 className="text-lg font-bold text-gray-900">{t('b2b.title')}</h1>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="mx-auto max-w-lg rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100">
                <Clock3 className="h-6 w-6 text-amber-700" />
              </div>
              <div>
                <p className="text-sm font-medium text-amber-900">{t('b2b.pendingReviewTitle')}</p>
                <p className="text-sm text-amber-900">{t('b2b.pendingReviewStatus')}</p>
              </div>
            </div>
            {pendingReview.duration_months != null && (
              <p className="text-sm text-amber-900">
                {t('b2b.selectedDurationSummary', { months: pendingReview.duration_months })}
              </p>
            )}
            <p className="mt-2 text-xs text-amber-800">
              {t('b2b.paymentReportedOn', {
                date: new Date(pendingReview.created_at).toLocaleString(),
              })}
            </p>
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
    } catch {
      setError(t('errors.generic'))
    } finally {
      setUploadingScreenshot(false)
      e.target.value = ''
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('b2b-subscribe', {
        body: {
          payment_method: 'KBZ_PAY',
          duration_months: durationMonths,
          payment_reference: paymentReference.trim(),
          screenshot_path: screenshotPath || undefined,
        },
      })
      if (fnErr) throw fnErr
      if (data?.error) throw new Error(data.error)
      await Promise.all([refresh(), refreshPendingReview()])
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      if (message.includes('PENDING_REVIEW')) {
        setError(t('b2b.pendingReviewStatus'))
      } else if (message.includes('ACTIVE_SUBSCRIPTION')) {
        setError(t('b2b.activeSubscriptionExists'))
      } else {
        setError(t('errors.generic'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-gray-100 bg-white px-4 py-3">
        <h1 className="text-lg font-bold text-gray-900">{t('b2b.title')}</h1>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <p className="text-sm text-gray-700">{t('b2b.description')}</p>
        <p className="mt-1">
          <Link to="/help#guide-b2bAccess" className="text-sm font-semibold text-blue-600 underline">
            {t('help.links.b2bInline')}
          </Link>
        </p>

        <section className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
          <h2 className="mb-3 text-sm font-bold text-gray-900">{t('b2b.choosePlanDuration')}</h2>
          {pricingLoading ? (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              {DURATION_OPTIONS.map((m) => {
                const quote = quoteB2BPrice(pricingConfig, m)
                const selected = durationMonths === m
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setDurationMonths(m)}
                    className={[
                      'rounded-xl border p-3 text-left transition-all',
                      selected ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-gray-200 bg-white hover:border-blue-300',
                    ].join(' ')}
                  >
                    <p className="text-sm font-semibold text-gray-900">{t('b2b.durationLabel', { months: m })}</p>
                    <p className="mt-1 text-base font-bold text-blue-900">{formatMmk(quote.paid)}</p>
                    {quote.promoOn && quote.savings > 0 ? (
                      <>
                        <p className="text-xs text-gray-700 line-through">{formatMmk(quote.list)}</p>
                        <p className="text-xs font-semibold text-green-700">
                          {t('b2b.promoSavingsLine', {
                            percent: quote.promoPercent,
                            savings: formatMmk(quote.savings),
                          })}
                        </p>
                      </>
                    ) : (
                      <p className="text-xs text-gray-700">{t('b2b.listPriceOnly')}</p>
                    )}
                  </button>
                )
              })}
            </div>
          )}
          <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50 p-4">
            <ul className="list-inside list-disc space-y-1 text-sm text-blue-800">
              <li>{t('b2b.allRoutesAccess')}</li>
              <li>{t('b2b.oneAccountPerSub')}</li>
            </ul>
          </div>
          <p className="mt-3">
            <Link to="/benefits/fleet-owners" className="text-sm font-medium text-blue-600 underline active:text-blue-800">
              {t('b2b.seeFullBenefits')}
            </Link>
          </p>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-bold text-gray-900">{t('b2b.payVia')}</h2>
          {paymentConfigLoading ? (
            <div className="flex justify-center py-4">
              <Spinner />
            </div>
          ) : paymentInstructions ? (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
              {paymentInstructions}
            </div>
          ) : (
            <p className="text-xs text-gray-700">{t('b2b.contactForPayment')}</p>
          )}
          {paymentConfigError && (
            <p className="mt-3 text-xs text-amber-800">{t('b2b.paymentConfigUnavailable')}</p>
          )}
          {paymentQrUrl ? (
            <div className="mt-3">
              <p className="mb-1 text-xs font-medium text-gray-700">{t('b2b.qrCode')}</p>
              <img src={paymentQrUrl} alt={t('b2b.paymentQrAlt')} className="h-40 w-40 rounded border border-gray-200 object-cover" />
            </div>
          ) : null}
          {paymentPhoneKpay ? (
            <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
              <p>
                {t('b2b.paymentPhoneLabel')}:{' '}
                <a href={`tel:${paymentPhoneKpay.replace(/\s/g, '')}`} className="font-semibold text-blue-600 underline">
                  {paymentPhoneKpay}
                </a>
              </p>
            </div>
          ) : null}
        </section>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <section className="rounded-2xl border border-gray-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-bold text-gray-900">{t('b2b.paymentDetails')}</h2>

            <div className="space-y-3">
              <p className="text-xs text-gray-700">{t('b2b.kpayOnlyNotice')}</p>
              <p className="text-xs text-gray-700">
                {t('b2b.selectedDurationSummary', { months: durationMonths })}
              </p>

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
                  placeholder={t('b2b.paymentReferencePlaceholder')}
                  className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

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
                    <span className="flex-1 truncate text-sm text-gray-700">{t('b2b.screenshotUploaded')}</span>
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
      </div>
    </div>
  )
}
