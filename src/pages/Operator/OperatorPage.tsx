import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Store, CheckCircle, Send, Users } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { FUEL_CODES, FUEL_DISPLAY, STATUS_LABEL } from '@/lib/fuelUtils'
import type { Station, FuelCode, FuelStatus, QueueBucket, FuelStatuses } from '@/types'

type FuelStatusOrSkip = FuelStatus | 'SKIP'

export function OperatorPage() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'en' | 'my'
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [myStation, setMyStation] = useState<Station | null>(null)
  const [loading, setLoading] = useState(true)
  const [claimSubmitted, setClaimSubmitted] = useState(false)
  const [posting, setPosting] = useState(false)
  const [postResult, setPostResult] = useState<'success' | 'error' | null>(null)
  const [fuelStatuses, setFuelStatuses] = useState<Record<FuelCode, FuelStatusOrSkip>>({
    RON92: 'SKIP',
    RON95: 'SKIP',
    DIESEL: 'SKIP',
    PREMIUM_DIESEL: 'SKIP',
  })
  const [queue] = useState<QueueBucket>('NONE')

  useEffect(() => {
    if (!user) return
    void loadMyStation()
  }, [user])

  async function loadMyStation() {
    if (!user) return
    const { data } = await supabase
      .from('stations')
      .select('*')
      .eq('verified_owner_id', user.id)
      .single()
    setMyStation(data ?? null)
    setLoading(false)
  }

  async function postUpdate() {
    if (!myStation || !user) return
    setPosting(true)
    try {
      const fs: FuelStatuses = {}
      for (const code of FUEL_CODES) {
        const v = fuelStatuses[code]
        if (v !== 'SKIP') fs[code] = v
      }

      const { error } = await supabase.functions.invoke('submit-report', {
        body: {
          station_id: myStation.id,
          fuel_statuses: fs,
          queue_bucket: queue,
          reporter_role: 'VERIFIED_STATION',
          user_id: user.id,
        },
      })

      setPostResult(error ? 'error' : 'success')
    } catch {
      setPostResult('error')
    } finally {
      setPosting(false)
    }
  }

  if (!user) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <div>
          <Store className="mx-auto mb-3 h-12 w-12 text-gray-300" />
          <p className="text-gray-500 mb-3">{t('auth.signIn')}</p>
          <Button onClick={() => navigate('/auth')}>{t('auth.signIn')}</Button>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-100 bg-white px-4 py-3">
        <h1 className="text-lg font-bold text-gray-900">{t('operator.title')}</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* No station yet */}
        {!myStation && (
          <div className="rounded-2xl bg-blue-50 p-5 text-center">
            <Store className="mx-auto mb-2 h-8 w-8 text-blue-400" />
            <p className="font-semibold text-blue-900">{t('operator.claimTitle')}</p>
            <p className="mt-1 text-sm text-blue-700">{t('operator.claimDescription')}</p>
            {!claimSubmitted ? (
              <Button
                size="md"
                className="mt-3"
                onClick={async () => {
                  // In real flow, user selects a station from list
                  setClaimSubmitted(true)
                }}
              >
                {t('operator.claimButton')}
              </Button>
            ) : (
              <p className="mt-3 text-sm font-medium text-blue-600">
                ✓ {t('operator.claimPending')}
              </p>
            )}
          </div>
        )}

        {/* Has verified station */}
        {myStation && (
          <>
            <div className="rounded-2xl border border-green-200 bg-green-50 p-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <span className="font-semibold text-green-900">{myStation.name}</span>
              </div>
              <p className="mt-1 text-xs text-green-700">
                {myStation.township} · {t('station.verified')}
              </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-white border border-gray-100 p-3 text-center">
                <Users className="mx-auto h-5 w-5 text-gray-400 mb-1" />
                <p className="text-xs text-gray-500">{t('operator.followers')}</p>
                <p className="text-lg font-bold text-gray-800">—</p>
              </div>
              <div className="rounded-xl bg-white border border-gray-100 p-3 text-center">
                <Send className="mx-auto h-5 w-5 text-gray-400 mb-1" />
                <p className="text-xs text-gray-500">{t('operator.confirmations')}</p>
                <p className="text-lg font-bold text-gray-800">—</p>
              </div>
            </div>

            {/* Post update */}
            <div className="rounded-2xl bg-white border border-gray-200 p-4">
              <p className="font-semibold text-gray-800 mb-1">{t('operator.postUpdate')}</p>
              <p className="text-xs text-gray-500 mb-3">{t('operator.postUpdateHint')}</p>

              <div className="space-y-3">
                {FUEL_CODES.map((code) => (
                  <div key={code}>
                    <p className="text-xs font-medium text-gray-600 mb-1">
                      {FUEL_DISPLAY[code][lang]}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {(['AVAILABLE', 'LIMITED', 'OUT', 'SKIP'] as const).map((v) => (
                        <button
                          key={v}
                          onClick={() =>
                            setFuelStatuses((prev) => ({ ...prev, [code]: v }))
                          }
                          className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition-all ${
                            fuelStatuses[code] === v
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                          }`}
                        >
                          {v === 'SKIP'
                            ? t('report.fuelStatus.dontKnow')
                            : STATUS_LABEL[v as FuelStatus][lang]}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {postResult === 'success' && (
                <p className="mt-3 text-sm text-green-600">{t('report.success')}</p>
              )}
              {postResult === 'error' && (
                <p className="mt-3 text-sm text-red-600">{t('report.error')}</p>
              )}

              <Button
                variant="primary"
                size="lg"
                className="mt-4 w-full"
                loading={posting}
                onClick={() => void postUpdate()}
              >
                <Send className="h-4 w-4" />
                {t('operator.postUpdate')}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
