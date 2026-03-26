import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, ArrowRight, Send, CheckCircle2, MapPin, CircleHelp } from 'lucide-react'
import { clsx } from 'clsx'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { ReportingHelpSheet } from '@/components/report/ReportingHelpSheet'
import { FUEL_CODES, FUEL_DISPLAY, QUEUE_LABEL } from '@/lib/fuelUtils'
import { getDeviceHash } from '@/lib/deviceHash'
import { supabase } from '@/lib/supabase'
import { useLocationStore } from '@/stores/locationStore'
import type { FuelCode, FuelStatus, QueueBucket, FuelStatuses } from '@/types'

type FuelStatusChoice = FuelStatus | 'SKIP'

const FUEL_STATUS_OPTIONS: { value: FuelStatusChoice; emoji: string; labelKey: string; activeClass: string }[] = [
  { value: 'AVAILABLE', emoji: '🟢', labelKey: 'report.fuelStatus.available', activeClass: 'border-green-500 bg-green-50 text-green-700 ring-2 ring-green-400' },
  { value: 'LIMITED',   emoji: '🟡', labelKey: 'report.fuelStatus.limited',   activeClass: 'border-yellow-400 bg-yellow-50 text-yellow-700 ring-2 ring-yellow-400' },
  { value: 'OUT',       emoji: '🔴', labelKey: 'report.fuelStatus.out',       activeClass: 'border-red-500 bg-red-50 text-red-700 ring-2 ring-red-400' },
  { value: 'SKIP',      emoji: '—',  labelKey: 'report.fuelStatus.dontKnow', activeClass: 'border-gray-400 bg-gray-100 text-gray-700 ring-2 ring-gray-300' },
]

const QUEUE_OPTIONS: QueueBucket[] = ['NONE', 'MIN_0_15', 'MIN_15_30', 'MIN_30_60', 'MIN_60_PLUS']

function track(event: string, payload?: Record<string, unknown>) {
  console.info(`[analytics] ${event}`, payload ?? {})
}

export function ReportPage() {
  const { id: stationId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'en' | 'my'
  const { lat, lng, requestLocation } = useLocationStore()

  const locationReady = lat != null && lng != null
  const [stationName, setStationName] = useState<string | null>(null)
  const [stationArea, setStationArea] = useState<string>('')
  const [stationLoading, setStationLoading] = useState(true)
  const [stationMissing, setStationMissing] = useState(false)

  useEffect(() => {
    if (!stationId) {
      navigate('/report', { replace: true })
      return
    }
    let cancelled = false
    setStationMissing(false)
    setStationName(null)
    setStationArea('')
    setStationLoading(true)
    void (async () => {
      const { data, error } = await supabase
        .from('stations')
        .select('id, name, township, city')
        .eq('id', stationId)
        .eq('is_active', true)
        .single()
      if (cancelled) return
      if (error || !data) {
        setStationMissing(true)
      } else {
        setStationName(data.name)
        setStationArea(`${data.township}, ${data.city}`)
      }
      setStationLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [stationId, navigate])

  // Request location on mount if not already available — the server now requires coordinates
  // for all non-verified-station reports.
  useEffect(() => {
    if (!locationReady) {
      requestLocation()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (stationId) track('report_form_opened', { station_id: stationId })
  }, [stationId])

  const [step, setStep] = useState(1)
  const [fuelStatuses, setFuelStatuses] = useState<Record<FuelCode, FuelStatusChoice>>({
    RON92: 'SKIP',
    RON95: 'SKIP',
    DIESEL: 'SKIP',
    PREMIUM_DIESEL: 'SKIP',
  })
  const [queueBucket, setQueueBucket] = useState<QueueBucket>('NONE')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<'success' | 'error' | 'toofar' | 'ratelimit' | 'dailylimit' | 'locationrequired' | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [helpViewed, setHelpViewed] = useState(false)

  function setFuelStatus(code: FuelCode, value: FuelStatusChoice) {
    setFuelStatuses((prev) => ({ ...prev, [code]: value }))
  }

  async function submit() {
    setSubmitting(true)
    try {
      const deviceHash = await getDeviceHash()
      const fuelStatusesPayload: FuelStatuses = {}
      for (const code of FUEL_CODES) {
        const val = fuelStatuses[code]
        if (val !== 'SKIP') fuelStatusesPayload[code] = val as FuelStatus
      }

      const { data, error } = await supabase.functions.invoke('submit-report', {
        body: {
          station_id: stationId,
          device_hash: deviceHash,
          fuel_statuses: fuelStatusesPayload,
          queue_bucket: queueBucket,
          note: note.trim() || null,
          user_lat: lat,
          user_lng: lng,
          // user_id intentionally omitted — server extracts identity from JWT only
        },
      })

      function applySubmitErrorMessage(msg: string) {
        if (msg.includes('TOO_FAR')) { setResult('toofar'); return }
        if (msg.includes('RATE_LIMIT')) { setResult('ratelimit'); return }
        if (msg.includes('DAILY_LIMIT')) { setResult('dailylimit'); return }
        if (msg.includes('LOCATION_REQUIRED')) { setResult('locationrequired'); return }
        setResult('error')
      }

      if (error) {
        applySubmitErrorMessage(error.message ?? '')
        return
      }
      if (data && typeof data === 'object' && typeof (data as { error?: unknown }).error === 'string') {
        applySubmitErrorMessage((data as { error: string }).error)
        return
      }

      setResult('success')
      track('report_submit_success', { station_id: stationId })
      if (helpViewed) {
        track('report_submit_after_help', { station_id: stationId })
      }
      setTimeout(() => navigate(stationId ? `/station/${stationId}` : '/report'), 1800)
    } catch {
      setResult('error')
    } finally {
      setSubmitting(false)
    }
  }

  if (result === 'success') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-5 p-8 text-center">
        <div className="rounded-full bg-green-100 p-5">
          <CheckCircle2 className="h-10 w-10 text-green-500" />
        </div>
        <p className="text-xl font-bold text-gray-800">{t('report.success')}</p>
        <p className="text-sm text-gray-700">Returning to station…</p>
      </div>
    )
  }

  if (stationLoading) {
    return (
      <div className="flex h-full items-center justify-center"><Spinner /></div>
    )
  }

  if (stationMissing) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-lg font-bold text-gray-900">{t('report.stationNotFoundTitle')}</p>
        <p className="text-sm text-gray-700">{t('report.stationNotFoundBody')}</p>
        <Button type="button" onClick={() => navigate('/report')}>
          {t('report.selectAnotherStation')}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Header with 44px back button */}
      <div className="flex items-center gap-3 border-b border-gray-100 px-2 py-1">
        <button
          onClick={() => (step > 1 ? setStep(step - 1) : navigate('/report'))}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl active:bg-gray-100"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5 text-gray-700" />
        </button>
        <div>
          <h1 className="text-base font-bold text-gray-900">{t('report.title')}</h1>
          {stationName && (
            <p className="text-xs text-gray-700">
              {stationName}
              {stationArea ? ` · ${stationArea}` : ''}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            setHelpOpen(true)
            setHelpViewed(true)
            track('report_help_opened', { context: 'report' })
          }}
          className="ml-auto flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl active:bg-gray-100"
          aria-label={t('report.help.open')}
          title={t('report.help.open')}
        >
          <CircleHelp className="h-5 w-5 text-gray-700" />
        </button>
        {/* Step progress */}
        <div className="flex gap-1.5 pr-3">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={clsx(
                'h-2 rounded-full transition-all',
                s < step ? 'w-6 bg-blue-600' : s === step ? 'w-8 bg-blue-600' : 'w-6 bg-gray-200',
              )}
            />
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scroll-touch px-4 pt-5 pb-4">
        <div className="mb-4 rounded-2xl border border-blue-200 bg-blue-50 p-3">
          <p className="text-xs font-semibold text-blue-900">{t('report.reportingFor')}</p>
          <p className="text-sm font-semibold text-blue-900">{stationName}</p>
          {stationArea && <p className="text-xs text-blue-900">{stationArea}</p>}
          <button
            type="button"
            onClick={() => navigate('/report')}
            className="mt-2 text-xs font-semibold text-blue-700 underline underline-offset-2"
          >
            {t('report.changeStation')}
          </button>
        </div>

        {/* Location required banner */}
        {!locationReady && (
          <div className="mb-4 flex items-start gap-3 rounded-2xl bg-amber-50 p-3.5">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div>
              <p className="text-sm font-semibold text-amber-800">{t('report.locationNeeded')}</p>
              <button
                type="button"
                onClick={() => requestLocation({ highAccuracy: true })}
                className="mt-1 text-xs font-medium text-amber-700 underline"
              >
                {t('report.tapToShareLocation')}
              </button>
            </div>
          </div>
        )}

        {/* Step 1 — fuel status per type */}
        {step === 1 && (
          <div>
            <p className="mb-5 text-lg font-bold text-gray-900">{t('report.step1')}</p>
            <div className="space-y-5">
              {FUEL_CODES.map((code) => (
                <div key={code}>
                  <p className="mb-2 text-sm font-semibold text-gray-700 uppercase tracking-wide">
                    {FUEL_DISPLAY[code][lang]}
                  </p>
                  {/* 2×2 grid — each button ≥52px tall for easy thumb tap */}
                  <div className="grid grid-cols-2 gap-2.5">
                    {FUEL_STATUS_OPTIONS.map(({ value, emoji, labelKey, activeClass }) => {
                      const active = fuelStatuses[code] === value
                      return (
                        <button
                          key={value}
                          onClick={() => setFuelStatus(code, value)}
                          className={clsx(
                            'flex min-h-[52px] items-center justify-center gap-2 rounded-2xl border-2 text-sm font-semibold transition-all active:scale-95',
                            active
                              ? activeClass
                              : 'border-gray-200 bg-gray-50 text-gray-700 active:bg-gray-100',
                          )}
                        >
                          <span role="img" aria-hidden>{emoji}</span>
                          {t(labelKey)}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 2 — queue bucket */}
        {step === 2 && (
          <div>
            <p className="mb-5 text-lg font-bold text-gray-900">{t('report.step2')}</p>
            <div className="space-y-2.5">
              {QUEUE_OPTIONS.map((bucket) => (
                <button
                  key={bucket}
                  onClick={() => setQueueBucket(bucket)}
                  className={clsx(
                    // Tall rows — easy to hit while holding a phone one-handed
                    'flex min-h-[56px] w-full items-center rounded-2xl border-2 px-5 text-left text-base font-medium transition-all active:scale-[0.98]',
                    queueBucket === bucket
                      ? 'border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-400'
                      : 'border-gray-200 bg-gray-50 text-gray-700 active:bg-gray-100',
                  )}
                >
                  {QUEUE_LABEL[bucket][lang]}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 3 — optional note */}
        {step === 3 && (
          <div>
            <p className="mb-2 text-lg font-bold text-gray-900">{t('report.step3')}</p>
            <p className="mb-4 text-sm text-gray-700">Optional — skip if nothing special.</p>
            {/* font-size 16px prevents iOS auto-zoom on focus */}
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('report.notePlaceholder')}
              maxLength={280}
              rows={4}
              style={{ fontSize: '16px' }}
              className="w-full rounded-2xl border-2 border-gray-200 bg-gray-50 p-4 leading-relaxed text-gray-800 placeholder-gray-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <p className="mt-2 text-right text-xs text-gray-700">{note.length}/280</p>
          </div>
        )}

        {/* Inline error feedback */}
        {result === 'error' && (
          <div className="mt-5 rounded-2xl bg-red-50 p-4 text-sm font-medium text-red-700">
            {t('report.error')}
          </div>
        )}
        {result === 'toofar' && (
          <div className="mt-5 rounded-2xl bg-orange-50 p-4 text-sm font-medium text-orange-700">
            {t('report.tooFar')}
          </div>
        )}
        {result === 'ratelimit' && (
          <div className="mt-5 rounded-2xl bg-yellow-50 p-4 text-sm font-medium text-yellow-700">
            {t('report.rateLimited')}
          </div>
        )}
        {result === 'dailylimit' && (
          <div className="mt-5 rounded-2xl bg-blue-50 p-4 text-sm font-medium text-blue-700">
            {t('report.dailyLimit')}
          </div>
        )}
        {result === 'locationrequired' && (
          <div className="mt-5 rounded-2xl bg-orange-50 p-4 text-sm font-medium text-orange-700">
            {t('report.locationRequired')}
          </div>
        )}
      </div>

      {/* Sticky footer — always visible, big tap target */}
      <div className="border-t border-gray-100 px-4 py-3 pb-safe">
        {step < 3 ? (
          <Button variant="primary" size="lg" className="w-full" onClick={() => setStep(step + 1)}>
            Next
            <ArrowRight className="h-5 w-5" />
          </Button>
        ) : (
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            loading={submitting}
            disabled={!locationReady}
            onClick={() => void submit()}
          >
            <Send className="h-5 w-5" />
            {submitting ? t('report.submitting') : t('report.submit')}
          </Button>
        )}
      </div>
      <ReportingHelpSheet
        open={helpOpen}
        context="report"
        onClose={() => {
          setHelpOpen(false)
          track('report_help_closed', { context: 'report' })
        }}
      />
    </div>
  )
}
