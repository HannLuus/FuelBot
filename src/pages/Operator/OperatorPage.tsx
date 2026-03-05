import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Store, CheckCircle, Send, Users, MapPin } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { FUEL_CODES, FUEL_DISPLAY, STATUS_LABEL } from '@/lib/fuelUtils'
import type { Station, FuelCode, FuelStatus, QueueBucket, FuelStatuses } from '@/types'

type FuelStatusOrSkip = FuelStatus | 'SKIP'

const VERIFIED_PRICE_MONTHLY = '15' // USD or local equivalent — adjust as needed

export function OperatorPage() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language as 'en' | 'my'
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [myStation, setMyStation] = useState<Station | null>(null)
  const [loading, setLoading] = useState(true)
  const [posting, setPosting] = useState(false)
  const [postResult, setPostResult] = useState<'success' | 'error' | null>(null)
  const [registering, setRegistering] = useState(false)
  const [registerResult, setRegisterResult] = useState<'success' | 'error' | null>(null)
  const [registerForm, setRegisterForm] = useState({ name: '', address: '', township: '', city: 'Yangon' })
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

  async function submitRegistration(e: React.FormEvent) {
    e.preventDefault()
    if (!user || registering) return
    setRegistering(true)
    setRegisterResult(null)
    try {
      const { error } = await supabase.functions.invoke('register-station', {
        body: {
          name: registerForm.name.trim(),
          address: registerForm.address.trim() || null,
          township: registerForm.township.trim() || undefined,
          city: registerForm.city.trim() || 'Yangon',
        },
      })
      if (error) throw error
      setRegisterResult('success')
      setRegisterForm({ name: '', address: '', township: '', city: 'Yangon' })
      void loadMyStation()
    } catch {
      setRegisterResult('error')
    } finally {
      setRegistering(false)
    }
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
          <Store className="mx-auto mb-3 h-12 w-12 text-gray-700" />
          <p className="text-gray-700 mb-3">{t('auth.signIn')}</p>
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
        {/* Tiers — how we make money */}
        <section className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
          <h2 className="text-sm font-bold text-gray-900 mb-3">{t('operator.tiersTitle')}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-white p-3">
              <p className="font-semibold text-gray-800">{t('operator.tierFree')}</p>
              <p className="mt-1 text-xs text-gray-700">{t('operator.tierFreeDesc')}</p>
            </div>
            <div className="rounded-xl border-2 border-blue-200 bg-blue-50/50 p-3">
              <p className="font-semibold text-blue-900">{t('operator.tierVerified')}</p>
              <p className="mt-1 text-xs text-blue-800">{t('operator.tierVerifiedDesc')}</p>
              <p className="mt-2 text-sm font-bold text-blue-700">
                {t('operator.pricePerMonth', { amount: `$${VERIFIED_PRICE_MONTHLY}` })}
              </p>
              <p className="mt-0.5 text-xs text-blue-600">{t('operator.contactToSubscribe')}</p>
            </div>
          </div>
        </section>

        {/* No station yet: Register (owner-first) or Claim existing */}
        {!myStation && (
          <>
            <div className="rounded-2xl bg-white border border-gray-200 p-5">
              <Store className="mb-2 h-8 w-8 text-blue-500" />
              <h2 className="font-semibold text-gray-900">{t('operator.registerTitle')}</h2>
              <p className="mt-1 text-sm text-gray-700">{t('operator.registerIntro')}</p>
              <form onSubmit={submitRegistration} className="mt-4 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    {t('operator.registerFormName')} *
                  </label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    value={registerForm.name}
                    onChange={(e) => setRegisterForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="e.g. Myanmar Petroleum Station"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    {t('operator.registerFormAddress')}
                  </label>
                  <input
                    type="text"
                    value={registerForm.address}
                    onChange={(e) => setRegisterForm((f) => ({ ...f, address: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="Street, road"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      {t('operator.registerFormTownship')}
                    </label>
                    <input
                      type="text"
                      value={registerForm.township}
                      onChange={(e) => setRegisterForm((f) => ({ ...f, township: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      {t('operator.registerFormCity')}
                    </label>
                    <input
                      type="text"
                      value={registerForm.city}
                      onChange={(e) => setRegisterForm((f) => ({ ...f, city: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
                {registerResult === 'success' && (
                  <p className="text-sm text-green-600">{t('operator.registerSuccess')}</p>
                )}
                {registerResult === 'error' && (
                  <p className="text-sm text-red-600">{t('operator.registerError')}</p>
                )}
                <Button type="submit" size="lg" className="w-full" loading={registering}>
                  {t('operator.registerSubmit')}
                </Button>
              </form>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm font-semibold text-gray-800">{t('operator.claimExistingTitle')}</p>
              <p className="mt-0.5 text-xs text-gray-700">{t('operator.claimExistingDesc')}</p>
              <Button
                variant="secondary"
                size="md"
                className="mt-3"
                onClick={() => navigate('/')}
              >
                <MapPin className="h-4 w-4" />
                {t('operator.claimButton')}
              </Button>
            </div>
          </>
        )}

        {/* Has verified station */}
        {myStation && (
          <>
            <div className={`rounded-2xl border p-4 ${myStation.is_verified ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
              <div className="flex items-center gap-2">
                <CheckCircle className={`h-5 w-5 ${myStation.is_verified ? 'text-green-600' : 'text-amber-600'}`} />
                <span className={`font-semibold ${myStation.is_verified ? 'text-green-900' : 'text-amber-900'}`}>
                  {myStation.name}
                </span>
              </div>
              <p className={`mt-1 text-xs ${myStation.is_verified ? 'text-green-700' : 'text-amber-700'}`}>
                {myStation.township}
                {myStation.is_verified ? ` · ${t('station.verified')}` : ` · ${t('operator.pendingVerification')}`}
              </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-white border border-gray-100 p-3 text-center">
                <Users className="mx-auto h-5 w-5 text-gray-700 mb-1" />
                <p className="text-xs text-gray-700">{t('operator.followers')}</p>
                <p className="text-lg font-bold text-gray-800">—</p>
              </div>
              <div className="rounded-xl bg-white border border-gray-100 p-3 text-center">
                <Send className="mx-auto h-5 w-5 text-gray-700 mb-1" />
                <p className="text-xs text-gray-700">{t('operator.confirmations')}</p>
                <p className="text-lg font-bold text-gray-800">—</p>
              </div>
            </div>

            {/* Post update — only when verified */}
            <div className="rounded-2xl bg-white border border-gray-200 p-4">
              <p className="font-semibold text-gray-800 mb-1">{t('operator.postUpdate')}</p>
              {!myStation.is_verified ? (
                <p className="text-sm text-amber-700 mb-3">{t('operator.postAfterApproval')}</p>
              ) : (
                <>
                  <p className="text-xs text-gray-700 mb-3">{t('operator.postUpdateHint')}</p>

                  <div className="space-y-3">
                {FUEL_CODES.map((code) => (
                  <div key={code}>
                    <p className="text-xs font-medium text-gray-700 mb-1">
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
                              : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
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
                disabled={!myStation.is_verified}
                onClick={() => void postUpdate()}
              >
                <Send className="h-4 w-4" />
                {t('operator.postUpdate')}
              </Button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
