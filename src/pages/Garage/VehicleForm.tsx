import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import type { AssetType, FleetVehicle, FuelCode } from '@/types'
import type { VehicleInput } from '@/hooks/useFleetVehicles'

const ASSET_TYPES: AssetType[] = [
  'CAR',
  'MOTORCYCLE',
  'VAN',
  'PICKUP',
  'BUS',
  'TRUCK',
  'GENERATOR',
  'OTHER',
]
const FUEL_CODES: FuelCode[] = ['DIESEL', 'PREMIUM_DIESEL', 'RON92', 'RON95']
const COMMERCIAL_DETAIL_TYPES: AssetType[] = ['VAN', 'PICKUP', 'BUS', 'TRUCK']

const inputClass =
  'w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'
const labelClass = 'mb-1.5 block text-xs font-medium text-gray-700'

interface VehicleFormProps {
  initial?: FleetVehicle
  submitting: boolean
  error?: string | null
  onSubmit: (input: VehicleInput) => void | Promise<void>
  onCancel: () => void
}

function numOrNull(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

function strOrNull(value: string): string | null {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

export function VehicleForm({ initial, submitting, error, onSubmit, onCancel }: VehicleFormProps) {
  const { t } = useTranslation()
  const [assetType, setAssetType] = useState<AssetType>(initial?.asset_type ?? 'CAR')
  const [label, setLabel] = useState(initial?.label ?? '')
  const [manufacturer, setManufacturer] = useState(initial?.manufacturer ?? '')
  const [model, setModel] = useState(initial?.model ?? '')
  const [variant, setVariant] = useState(initial?.variant ?? '')
  const [year, setYear] = useState(initial?.year != null ? String(initial.year) : '')
  const [fuelCode, setFuelCode] = useState<FuelCode>(initial?.fuel_code ?? 'DIESEL')
  const [engineSize, setEngineSize] = useState(
    initial?.engine_size_l != null ? String(initial.engine_size_l) : '',
  )
  const [tankCapacity, setTankCapacity] = useState(
    initial?.tank_capacity_l != null ? String(initial.tank_capacity_l) : '',
  )
  const [gvwClass, setGvwClass] = useState(initial?.gvw_class ?? '')
  const [bodyType, setBodyType] = useState(initial?.body_type ?? '')
  const [axleConfig, setAxleConfig] = useState(initial?.axle_config ?? '')
  const [plate, setPlate] = useState(initial?.plate ?? '')
  const [region, setRegion] = useState(initial?.region ?? '')

  const showsCommercialDetails = COMMERCIAL_DETAIL_TYPES.includes(assetType)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const input: VehicleInput = {
      asset_type: assetType,
      label: strOrNull(label),
      manufacturer: strOrNull(manufacturer),
      model: strOrNull(model),
      variant: strOrNull(variant),
      year: numOrNull(year),
      fuel_code: fuelCode,
      engine_size_l: numOrNull(engineSize),
      tank_capacity_l: numOrNull(tankCapacity),
      gvw_class: showsCommercialDetails ? strOrNull(gvwClass) : null,
      body_type: showsCommercialDetails ? strOrNull(bodyType) : null,
      axle_config: showsCommercialDetails ? strOrNull(axleConfig) : null,
      plate: strOrNull(plate),
      region: strOrNull(region),
      is_active: initial?.is_active ?? true,
    }
    void onSubmit(input)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="vehicle-asset-type" className={labelClass}>
          {t('garage.assetType')}
        </label>
        <select
          id="vehicle-asset-type"
          value={assetType}
          onChange={(e) => setAssetType(e.target.value as AssetType)}
          className={inputClass}
        >
          {ASSET_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`garage.assetType${type}`)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="vehicle-label" className={labelClass}>
          {t('garage.label')}
        </label>
        <input
          id="vehicle-label"
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={t('garage.labelPlaceholder')}
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="vehicle-manufacturer" className={labelClass}>
            {t('garage.manufacturer')}
          </label>
          <input
            id="vehicle-manufacturer"
            type="text"
            value={manufacturer}
            onChange={(e) => setManufacturer(e.target.value)}
            placeholder={t('garage.manufacturerPlaceholder')}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="vehicle-model" className={labelClass}>
            {t('garage.model')}
          </label>
          <input
            id="vehicle-model"
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={t('garage.modelPlaceholder')}
            className={inputClass}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="vehicle-variant" className={labelClass}>
            {t('garage.variant')}
          </label>
          <input
            id="vehicle-variant"
            type="text"
            value={variant}
            onChange={(e) => setVariant(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="vehicle-year" className={labelClass}>
            {t('garage.year')}
          </label>
          <input
            id="vehicle-year"
            type="number"
            inputMode="numeric"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="vehicle-fuel" className={labelClass}>
            {t('garage.fuelType')}
          </label>
          <select
            id="vehicle-fuel"
            value={fuelCode}
            onChange={(e) => setFuelCode(e.target.value as FuelCode)}
            className={inputClass}
          >
            {FUEL_CODES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="vehicle-engine" className={labelClass}>
            {t('garage.engineSize')}
          </label>
          <input
            id="vehicle-engine"
            type="number"
            inputMode="decimal"
            step="0.1"
            min="0"
            value={engineSize}
            onChange={(e) => setEngineSize(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="vehicle-tank" className={labelClass}>
            {t('garage.tankCapacity')}
          </label>
          <input
            id="vehicle-tank"
            type="number"
            inputMode="decimal"
            step="0.1"
            min="0"
            value={tankCapacity}
            onChange={(e) => setTankCapacity(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="vehicle-region" className={labelClass}>
            {t('garage.region')}
          </label>
          <input
            id="vehicle-region"
            type="text"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            placeholder={t('garage.regionPlaceholder')}
            className={inputClass}
          />
        </div>
      </div>

      {showsCommercialDetails && (
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label htmlFor="vehicle-gvw" className={labelClass}>
              {t('garage.gvwClass')}
            </label>
            <input
              id="vehicle-gvw"
              type="text"
              value={gvwClass}
              onChange={(e) => setGvwClass(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="vehicle-body" className={labelClass}>
              {t('garage.bodyType')}
            </label>
            <input
              id="vehicle-body"
              type="text"
              value={bodyType}
              onChange={(e) => setBodyType(e.target.value)}
              placeholder={t('garage.bodyTypePlaceholder')}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="vehicle-axle" className={labelClass}>
              {t('garage.axleConfig')}
            </label>
            <input
              id="vehicle-axle"
              type="text"
              value={axleConfig}
              onChange={(e) => setAxleConfig(e.target.value)}
              placeholder={t('garage.axleConfigPlaceholder')}
              className={inputClass}
            />
          </div>
        </div>
      )}

      <div>
        <label htmlFor="vehicle-plate" className={labelClass}>
          {t('garage.plate')}
        </label>
        <input
          id="vehicle-plate"
          type="text"
          value={plate}
          onChange={(e) => setPlate(e.target.value)}
          className={inputClass}
        />
        <p className="mt-1 text-[11px] text-gray-700">{t('garage.plateHint')}</p>
      </div>

      {!manufacturer.trim() || !model.trim() ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {t('garage.makeModelRequired')}
        </p>
      ) : null}

      {error && <p className="text-sm font-medium text-red-600">{error}</p>}

      <div className="flex gap-3">
        <Button type="button" variant="secondary" className="flex-1" onClick={onCancel}>
          {t('garage.cancel')}
        </Button>
        <Button type="submit" variant="primary" className="flex-1" loading={submitting}>
          {submitting ? t('garage.saving') : t('garage.save')}
        </Button>
      </div>
    </form>
  )
}
