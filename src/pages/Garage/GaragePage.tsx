import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Truck,
  Plus,
  ChevronRight,
  Gauge,
  ClipboardList,
  BarChart3,
  Users,
  Map,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { useAuthStore } from '@/stores/authStore'
import { useFleetVehicles, type VehicleInput } from '@/hooks/useFleetVehicles'
import type { FleetVehicle } from '@/types'
import { VehicleForm } from './VehicleForm'

function vehicleTitle(v: FleetVehicle, fallback: string): string {
  if (v.label?.trim()) return v.label
  const parts = [v.manufacturer, v.model, v.variant].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : fallback
}

export function GaragePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { vehicles, efficiencyByVehicleId, loading, createVehicle } = useFleetVehicles()
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  if (!user) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center">
        <Truck className="mb-4 h-12 w-12 text-gray-700" />
        <h2 className="text-lg font-semibold text-gray-900">{t('garage.title')}</h2>
        <p className="mt-2 text-sm text-gray-700">{t('garage.signInRequired')}</p>
        <Button className="mt-4" onClick={() => navigate('/auth?redirect=/garage')}>
          {t('garage.signIn')}
        </Button>
      </div>
    )
  }

  async function handleCreate(input: VehicleInput) {
    setSubmitting(true)
    setFormError(null)
    const { data, error } = await createVehicle(input)
    setSubmitting(false)
    if (error || !data) {
      setFormError(t('garage.saveError'))
      return
    }
    setShowForm(false)
    navigate(`/garage/${data.id}`)
  }

  const howItWorks = [
    { icon: ClipboardList, text: t('garage.stepAddVehicle') },
    { icon: Gauge, text: t('garage.stepLogFillUps') },
    { icon: BarChart3, text: t('garage.stepSeeEfficiency') },
    { icon: Users, text: t('garage.stepComparePeers') },
  ]

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-gray-100 bg-white px-4 py-3">
        <h1 className="text-lg font-bold text-gray-900">{t('garage.title')}</h1>
        <p className="mt-0.5 text-xs text-gray-700">{t('garage.freeBadge')}</p>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <p className="text-sm text-gray-700">{t('garage.intro')}</p>
        <p className="text-sm">
          <Link to="/help#guide-garageEfficiency" className="font-semibold text-blue-600 underline">
            {t('help.links.garageInline')}
          </Link>
        </p>

        <section className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
          <h2 className="text-sm font-bold text-blue-900">{t('garage.howItWorksTitle')}</h2>
          <ol className="mt-3 space-y-2">
            {howItWorks.map(({ icon: Icon, text }, index) => (
              <li key={index} className="flex items-start gap-3 text-sm text-blue-900">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-800">
                  {index + 1}
                </span>
                <span className="flex min-w-0 flex-1 items-center gap-2 pt-0.5">
                  <Icon className="h-4 w-4 shrink-0 text-blue-700" aria-hidden="true" />
                  {text}
                </span>
              </li>
            ))}
          </ol>
        </section>

        {showForm ? (
          <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-bold text-gray-900">{t('garage.addVehicle')}</h2>
            <VehicleForm
              submitting={submitting}
              error={formError}
              onSubmit={handleCreate}
              onCancel={() => {
                setShowForm(false)
                setFormError(null)
              }}
            />
          </section>
        ) : (
          <Button variant="primary" className="w-full" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" />
            {t('garage.addVehicle')}
          </Button>
        )}

        <section>
          <h2 className="mb-2 text-sm font-bold text-gray-900">{t('garage.yourVehicles')}</h2>
          {loading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : vehicles.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-center">
              <Gauge className="mx-auto mb-2 h-8 w-8 text-gray-700" />
              <p className="text-sm font-medium text-gray-900">{t('garage.noVehicles')}</p>
              <p className="mt-1 text-xs text-gray-700">{t('garage.noVehiclesHint')}</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {vehicles.map((v) => {
                const summary = efficiencyByVehicleId[v.id]
                const avg = summary?.avg_l_per_100km
                return (
                  <li key={v.id}>
                    <Link
                      to={`/garage/${v.id}`}
                      className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm active:bg-gray-50"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100">
                        <Truck className="h-5 w-5 text-blue-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-gray-900">
                          {vehicleTitle(v, t('garage.unnamedVehicle'))}
                        </p>
                        <p className="truncate text-xs text-gray-700">
                          {t(`garage.assetType${v.asset_type}`)}
                          {v.year ? ` · ${v.year}` : ''}
                          {` · ${v.fuel_code}`}
                        </p>
                        {summary?.has_sufficient_data && avg != null ? (
                          <p className="mt-1 text-xs font-semibold text-blue-800">
                            {avg.toFixed(1)} {t('garage.lPer100km')} · {t('garage.avgConsumption')}
                          </p>
                        ) : (
                          <p className="mt-1 text-xs text-gray-700">{t('garage.listNeedsFillUps')}</p>
                        )}
                      </div>
                      <ChevronRight className="h-5 w-5 shrink-0 text-gray-700" />
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white">
              <Map className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900">{t('garage.paidUpsellTitle')}</h2>
              <p className="mt-1 text-xs text-gray-700">{t('garage.paidUpsellBody')}</p>
              <Link
                to="/b2b"
                className="mt-2 inline-block text-sm font-semibold text-blue-600 underline"
              >
                {t('garage.paidUpsellCta')}
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
