import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Plus, Pencil, Trash2, Fuel, TrendingDown, TrendingUp, Minus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { useVehicleEfficiency, type FuelLogInput } from '@/hooks/useVehicleEfficiency'
import { useFleetVehicles, type VehicleInput } from '@/hooks/useFleetVehicles'
import type { FleetVehicle } from '@/types'
import { VehicleForm } from './VehicleForm'
import { FuelLogForm } from './FuelLogForm'

/** PostgREST returns numeric/bigint as strings; coerce safely. */
function toNum(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function vehicleTitle(v: FleetVehicle, fallback: string): string {
  if (v.label?.trim()) return v.label
  const parts = [v.manufacturer, v.model, v.variant].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : fallback
}

export function VehicleDetailPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { vehicleId } = useParams<{ vehicleId: string }>()
  const { vehicle, logs, efficiency, benchmark, loading, error, addLog, deleteLog } =
    useVehicleEfficiency(vehicleId)
  const { updateVehicle, deleteVehicle } = useFleetVehicles()

  const [showLogForm, setShowLogForm] = useState(false)
  const [showEditForm, setShowEditForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    )
  }

  if (error || !vehicle) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center">
        <p className="text-sm text-gray-700">{t('errors.notFound')}</p>
        <Button className="mt-4" variant="secondary" onClick={() => navigate('/garage')}>
          {t('garage.title')}
        </Button>
      </div>
    )
  }

  const dateLocale = i18n.language === 'my' ? 'my-MM' : 'en-US'

  async function handleAddLog(input: FuelLogInput) {
    setSubmitting(true)
    setFormError(null)
    const { error: addError } = await addLog(input)
    setSubmitting(false)
    if (addError) {
      setFormError(t('garage.saveError'))
      return
    }
    setShowLogForm(false)
  }

  async function handleEditVehicle(input: VehicleInput) {
    if (!vehicleId) return
    setSubmitting(true)
    setFormError(null)
    const { error: updateError } = await updateVehicle(vehicleId, input)
    setSubmitting(false)
    if (updateError) {
      setFormError(t('garage.saveError'))
      return
    }
    setShowEditForm(false)
  }

  async function handleDeleteVehicle() {
    if (!vehicleId) return
    if (!window.confirm(t('garage.deleteVehicleConfirm'))) return
    const { error: deleteError } = await deleteVehicle(vehicleId)
    if (!deleteError) navigate('/garage')
  }

  async function handleDeleteLog(logId: string) {
    if (!window.confirm(t('garage.deleteFillUpConfirm'))) return
    await deleteLog(logId)
  }

  const avg = toNum(efficiency?.avg_l_per_100km)
  const last = toNum(efficiency?.last_l_per_100km)
  const best = toNum(efficiency?.best_l_per_100km)
  const totalDistance = toNum(efficiency?.total_distance_km)
  const samples = toNum(efficiency?.samples_count) ?? 0
  const hasEfficiency = efficiency?.has_sufficient_data === true && samples > 0

  const peerAvg = toNum(benchmark?.avg_l_per_100km)
  const peerLow = toNum(benchmark?.p25_l_per_100km)
  const peerHigh = toNum(benchmark?.p75_l_per_100km)
  const peerVehicles = toNum(benchmark?.peer_vehicles_count) ?? 0
  const peerOwners = toNum(benchmark?.peer_owners_count) ?? 0
  const hasBenchmark = benchmark?.has_sufficient_data === true && peerAvg !== null

  let comparison: 'better' | 'worse' | 'average' | null = null
  if (hasBenchmark && hasEfficiency && avg !== null && peerAvg !== null) {
    if (avg < peerAvg * 0.97) comparison = 'better'
    else if (avg > peerAvg * 1.03) comparison = 'worse'
    else comparison = 'average'
  }

  const unit = t('garage.lPer100km')

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-gray-100 bg-white px-2 py-3">
        <Link
          to="/garage"
          className="flex h-10 w-10 items-center justify-center rounded-xl text-gray-700 active:bg-gray-100"
          aria-label={t('garage.title')}
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-lg font-bold text-gray-900">
          {vehicleTitle(vehicle, t('garage.unnamedVehicle'))}
        </h1>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* Vehicle spec / edit */}
        {showEditForm ? (
          <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-bold text-gray-900">{t('garage.editVehicle')}</h2>
            <VehicleForm
              initial={vehicle}
              submitting={submitting}
              error={formError}
              onSubmit={handleEditVehicle}
              onCancel={() => {
                setShowEditForm(false)
                setFormError(null)
              }}
            />
          </section>
        ) : (
          <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs text-gray-700">
                  {t(`garage.assetType${vehicle.asset_type}`)}
                  {vehicle.year ? ` · ${vehicle.year}` : ''}
                  {` · ${vehicle.fuel_code}`}
                </p>
                {vehicle.region && (
                  <p className="mt-0.5 text-xs text-gray-700">{vehicle.region}</p>
                )}
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setShowEditForm(true)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-700 active:bg-gray-100"
                  aria-label={t('garage.editVehicle')}
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={handleDeleteVehicle}
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-red-600 active:bg-red-50"
                  aria-label={t('garage.deleteVehicle')}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Efficiency */}
        <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-bold text-gray-900">{t('garage.efficiencyTitle')}</h2>
          {hasEfficiency ? (
            <>
              <div className="flex items-end gap-2">
                <span className="text-3xl font-bold text-blue-900">{avg?.toFixed(1)}</span>
                <span className="pb-1 text-sm text-gray-700">{unit}</span>
                <span className="pb-1 text-xs text-gray-700">· {t('garage.avgConsumption')}</span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-gray-50 p-2">
                  <p className="text-[11px] text-gray-700">{t('garage.lastConsumption')}</p>
                  <p className="text-sm font-semibold text-gray-900">
                    {last != null ? last.toFixed(1) : '—'}
                  </p>
                </div>
                <div className="rounded-xl bg-gray-50 p-2">
                  <p className="text-[11px] text-gray-700">{t('garage.bestConsumption')}</p>
                  <p className="text-sm font-semibold text-gray-900">
                    {best != null ? best.toFixed(1) : '—'}
                  </p>
                </div>
                <div className="rounded-xl bg-gray-50 p-2">
                  <p className="text-[11px] text-gray-700">{t('garage.totalDistance')}</p>
                  <p className="text-sm font-semibold text-gray-900">
                    {totalDistance != null ? `${totalDistance.toFixed(0)} ${t('garage.km')}` : '—'}
                  </p>
                </div>
              </div>
              <p className="mt-2 text-[11px] text-gray-700">
                {t('garage.samples', { count: samples })}
              </p>
            </>
          ) : (
            <p className="text-sm text-gray-700">{t('garage.notEnoughData')}</p>
          )}
        </section>

        {/* Peer benchmark */}
        <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-bold text-gray-900">{t('garage.benchmarkTitle')}</h2>
          {!vehicle.manufacturer || !vehicle.model ? (
            <p className="text-sm text-gray-700">{t('garage.makeModelRequired')}</p>
          ) : !hasEfficiency ? (
            <p className="text-sm text-gray-700">{t('garage.benchmarkNeedsOwnData')}</p>
          ) : !hasBenchmark ? (
            <p className="text-sm text-gray-700">{t('garage.notEnoughPeers')}</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-blue-50 p-3">
                  <p className="text-[11px] text-blue-900">{t('garage.yourAverage')}</p>
                  <p className="text-lg font-bold text-blue-900">
                    {avg?.toFixed(1)} <span className="text-xs font-normal">{unit}</span>
                  </p>
                </div>
                <div className="rounded-xl bg-gray-50 p-3">
                  <p className="text-[11px] text-gray-700">{t('garage.peerAverage')}</p>
                  <p className="text-lg font-bold text-gray-900">
                    {peerAvg?.toFixed(1)} <span className="text-xs font-normal">{unit}</span>
                  </p>
                </div>
              </div>

              {comparison && (
                <div
                  className={[
                    'mt-3 flex items-start gap-2 rounded-xl p-3 text-sm',
                    comparison === 'better'
                      ? 'bg-green-50 text-green-800'
                      : comparison === 'worse'
                        ? 'bg-amber-50 text-amber-900'
                        : 'bg-gray-50 text-gray-700',
                  ].join(' ')}
                >
                  {comparison === 'better' ? (
                    <TrendingDown className="mt-0.5 h-4 w-4 shrink-0" />
                  ) : comparison === 'worse' ? (
                    <TrendingUp className="mt-0.5 h-4 w-4 shrink-0" />
                  ) : (
                    <Minus className="mt-0.5 h-4 w-4 shrink-0" />
                  )}
                  <span>{t(`garage.${comparison === 'average' ? 'aboutAverage' : comparison === 'better' ? 'betterThanPeers' : 'worseThanPeers'}`)}</span>
                </div>
              )}

              {peerLow != null && peerHigh != null && (
                <p className="mt-2 text-[11px] text-gray-700">
                  {t('garage.benchmarkRange', {
                    low: peerLow.toFixed(1),
                    high: peerHigh.toFixed(1),
                  })}
                </p>
              )}
              <p className="mt-1 text-[11px] text-gray-700">
                {t('garage.benchmarkBasis', { vehicles: peerVehicles, owners: peerOwners })}
              </p>
            </>
          )}
        </section>

        {/* Fill-ups */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-900">{t('garage.fillUpsTitle')}</h2>
            {!showLogForm && (
              <Button size="sm" variant="secondary" onClick={() => setShowLogForm(true)}>
                <Plus className="h-4 w-4" />
                {t('garage.addFillUp')}
              </Button>
            )}
          </div>

          {showLogForm && (
            <div className="mb-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <FuelLogForm
                submitting={submitting}
                error={formError}
                onSubmit={handleAddLog}
                onCancel={() => {
                  setShowLogForm(false)
                  setFormError(null)
                }}
              />
            </div>
          )}

          {logs.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-gray-300 bg-white p-4 text-center text-sm text-gray-700">
              {t('garage.noFillUps')}
            </p>
          ) : (
            <ul className="space-y-2">
              {logs.map((log) => (
                <li
                  key={log.id}
                  className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-100">
                    <Fuel className="h-4 w-4 text-gray-700" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      {log.liters} {t('garage.litersShort')} · {log.odometer_km} {t('garage.km')}
                      {!log.is_full_tank ? ' · ½' : ''}
                    </p>
                    <p className="text-xs text-gray-700">
                      {new Date(log.filled_at).toLocaleDateString(dateLocale)}
                      {log.price_paid_mmk != null
                        ? ` · ${log.price_paid_mmk.toLocaleString()} MMK`
                        : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteLog(log.id)}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-red-600 active:bg-red-50"
                    aria-label={t('garage.deleteFillUp')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
