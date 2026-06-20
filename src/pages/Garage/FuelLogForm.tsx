import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/Button'
import type { FuelLogInput } from '@/hooks/useVehicleEfficiency'

const inputClass =
  'w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'
const labelClass = 'mb-1.5 block text-xs font-medium text-gray-700'

function todayInputValue(): string {
  return new Date().toISOString().slice(0, 10)
}

interface FuelLogFormProps {
  submitting: boolean
  error?: string | null
  onSubmit: (input: FuelLogInput) => void | Promise<void>
  onCancel: () => void
}

export function FuelLogForm({ submitting, error, onSubmit, onCancel }: FuelLogFormProps) {
  const { t } = useTranslation()
  const [filledDate, setFilledDate] = useState(todayInputValue())
  const [odometer, setOdometer] = useState('')
  const [liters, setLiters] = useState('')
  const [isFullTank, setIsFullTank] = useState(true)
  const [price, setPrice] = useState('')
  const [note, setNote] = useState('')

  const odometerNum = Number(odometer)
  const litersNum = Number(liters)
  const canSubmit =
    odometer.trim() !== '' &&
    liters.trim() !== '' &&
    Number.isFinite(odometerNum) &&
    odometerNum >= 0 &&
    Number.isFinite(litersNum) &&
    litersNum > 0

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    const priceTrim = price.trim()
    const noteTrim = note.trim()
    const input: FuelLogInput = {
      filled_at: new Date(`${filledDate}T12:00:00`).toISOString(),
      odometer_km: odometerNum,
      liters: litersNum,
      is_full_tank: isFullTank,
      price_paid_mmk: priceTrim ? Number(priceTrim) : null,
      station_id: null,
      note: noteTrim ? noteTrim : null,
    }
    void onSubmit(input)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="log-date" className={labelClass}>
          {t('garage.fillUpDate')}
        </label>
        <input
          id="log-date"
          type="date"
          value={filledDate}
          max={todayInputValue()}
          onChange={(e) => setFilledDate(e.target.value)}
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="log-odometer" className={labelClass}>
            {t('garage.odometer')} *
          </label>
          <input
            id="log-odometer"
            type="number"
            inputMode="decimal"
            step="0.1"
            min="0"
            required
            value={odometer}
            onChange={(e) => setOdometer(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="log-liters" className={labelClass}>
            {t('garage.liters')} *
          </label>
          <input
            id="log-liters"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            required
            value={liters}
            onChange={(e) => setLiters(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      <label className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3">
        <input
          type="checkbox"
          checked={isFullTank}
          onChange={(e) => setIsFullTank(e.target.checked)}
          className="mt-0.5 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <span>
          <span className="block text-sm font-medium text-gray-900">{t('garage.fullTank')}</span>
          <span className="block text-[11px] text-gray-700">{t('garage.fullTankHint')}</span>
        </span>
      </label>

      <div>
        <label htmlFor="log-price" className={labelClass}>
          {t('garage.pricePaid')}
        </label>
        <input
          id="log-price"
          type="number"
          inputMode="decimal"
          step="1"
          min="0"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="log-note" className={labelClass}>
          {t('garage.note')}
        </label>
        <input
          id="log-note"
          type="text"
          maxLength={280}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('garage.notePlaceholder')}
          className={inputClass}
        />
      </div>

      {error && <p className="text-sm font-medium text-red-600">{error}</p>}

      <div className="flex gap-3">
        <Button type="button" variant="secondary" className="flex-1" onClick={onCancel}>
          {t('garage.cancel')}
        </Button>
        <Button
          type="submit"
          variant="primary"
          className="flex-1"
          loading={submitting}
          disabled={!canSubmit}
        >
          {submitting ? t('garage.saving') : t('garage.save')}
        </Button>
      </div>
    </form>
  )
}
