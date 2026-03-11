import type { FuelCode, FuelStatus, QueueBucket, ReporterRole } from '@/types'

export const FUEL_CODES: FuelCode[] = ['RON92', 'RON95', 'DIESEL', 'PREMIUM_DIESEL']

export const FUEL_DISPLAY: Record<FuelCode, { en: string; my: string }> = {
  RON92: { en: '92', my: '၉၂' },
  RON95: { en: '95', my: '၉၅' },
  DIESEL: { en: 'Diesel', my: 'ဒီဇယ်' },
  PREMIUM_DIESEL: { en: 'Premium Diesel', my: 'ပရီမီယံဒီဇယ်' },
}

export const STATUS_COLORS: Record<FuelStatus, string> = {
  AVAILABLE: 'bg-green-500 text-white',
  LIMITED: 'bg-yellow-400 text-black',
  OUT: 'bg-red-500 text-white',
  UNKNOWN: 'bg-gray-300 text-gray-600',
}

export const STATUS_DOT_COLORS: Record<FuelStatus, string> = {
  AVAILABLE: 'bg-green-500',
  LIMITED: 'bg-yellow-400',
  OUT: 'bg-red-500',
  UNKNOWN: 'bg-indigo-500',
}

export const STATUS_RING_COLORS: Record<FuelStatus, string> = {
  AVAILABLE: 'ring-green-500',
  LIMITED: 'ring-yellow-400',
  OUT: 'ring-red-500',
  UNKNOWN: 'ring-gray-300',
}

export const STATUS_LABEL: Record<FuelStatus, { en: string; my: string }> = {
  AVAILABLE: { en: 'Available', my: 'ရှိသည်' },
  LIMITED: { en: 'Running Low', my: 'နည်းနည်းကျန်သည်' },
  OUT: { en: 'Empty', my: 'ကုန်သွားသည်' },
  UNKNOWN: { en: 'Unknown', my: 'မသိ' },
}

export const QUEUE_LABEL: Record<QueueBucket, { en: string; my: string }> = {
  NONE: { en: 'No queue', my: 'တန်းစောင့်မနေရ' },
  MIN_0_15: { en: '0–15 min', my: '0–15 မိနစ်' },
  MIN_15_30: { en: '15–30 min', my: '15–30 မိနစ်' },
  MIN_30_60: { en: '30–60 min', my: '30–60 မိနစ်' },
  MIN_60_PLUS: { en: '60+ min', my: '60 မိနစ်အထက်' },
}

export const REPORTER_ROLE_LABEL: Record<ReporterRole, { en: string; my: string }> = {
  VERIFIED_STATION: { en: 'Verified Station', my: 'အတည်ပြုချက်ရပြီးသောဆိုင်' },
  TRUSTED: { en: 'Trusted Reporter', my: 'ယုံကြည်ရသောသတင်းပေးသူ' },
  CROWD: { en: 'Community', my: 'လူထု' },
  ANON: { en: 'Anonymous', my: 'အမည်မသိ' },
}

/**
 * Returns the "worst" (most alarming) fuel status from a set of statuses.
 * Used for colouring a station pin on the map when no fuel filter is applied.
 */
export function worstStatus(statuses: Partial<Record<FuelCode, FuelStatus>>): FuelStatus {
  const values = Object.values(statuses) as FuelStatus[]
  if (values.includes('OUT')) return 'OUT'
  if (values.includes('LIMITED')) return 'LIMITED'
  if (values.includes('AVAILABLE')) return 'AVAILABLE'
  return 'UNKNOWN'
}

/**
 * Returns the worst status among only the selected fuel types.
 * Used for map dot colour when the user has filtered by fuel (e.g. 95 or Diesel):
 * dot shows green/yellow/red for that fuel’s status at each station.
 * If no fuels selected, falls back to worst across all fuels.
 */
export function worstStatusForFuels(
  statuses: Partial<Record<FuelCode, FuelStatus>> | null | undefined,
  selectedFuelCodes: FuelCode[],
): FuelStatus {
  if (!statuses || Object.keys(statuses).length === 0) return 'UNKNOWN'
  if (selectedFuelCodes.length === 0) return worstStatus(statuses)
  const values = selectedFuelCodes
    .map((code) => statuses[code])
    .filter((s): s is FuelStatus => s != null)
  if (values.length === 0) return 'UNKNOWN'
  if (values.includes('OUT')) return 'OUT'
  if (values.includes('LIMITED')) return 'LIMITED'
  if (values.includes('AVAILABLE')) return 'AVAILABLE'
  return 'UNKNOWN'
}

/**
 * Returns the "best" available status for a station.
 * Used for the "has fuel" filter.
 */
export function bestStatus(statuses: Partial<Record<FuelCode, FuelStatus>>): FuelStatus {
  const values = Object.values(statuses) as FuelStatus[]
  if (values.includes('AVAILABLE')) return 'AVAILABLE'
  if (values.includes('LIMITED')) return 'LIMITED'
  if (values.includes('OUT')) return 'OUT'
  return 'UNKNOWN'
}

export function formatDistance(metres: number): string {
  if (metres < 1000) return `${Math.round(metres)} m`
  return `${(metres / 1000).toFixed(1)} km`
}

export function formatRelativeTime(isoString: string | null): string {
  if (!isoString) return 'No data'
  const diff = Date.now() - new Date(isoString).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function haversineDistanceMetres(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** True if station is verified by distributor list, crowd (10 reports), or owner (claim+pay). Unverified stations are shown grey. */
export function isStationVerified(s: {
  is_verified?: boolean
  verification_source?: string | null
  verificationSource?: string | null
}): boolean {
  const src = s.verification_source ?? s.verificationSource ?? ''
  return Boolean(s.is_verified || (typeof src === 'string' && src !== ''))
}

const THREE_MONTHS_MS = 3 * 30 * 24 * 60 * 60 * 1000

/** True if station should be shown on map/list: verified OR created within last 3 months. */
export function isStationVisible(s: {
  is_verified?: boolean
  verification_source?: string | null
  created_at?: string | null
}): boolean {
  if (isStationVerified(s)) return true
  const created = s.created_at ? new Date(s.created_at).getTime() : 0
  return created > Date.now() - THREE_MONTHS_MS
}
