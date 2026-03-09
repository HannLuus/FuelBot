export type SubscriptionTierRequested = 'small' | 'medium' | 'large'

export interface TierConfig {
  key: SubscriptionTierRequested
  sortOrder: number
  name: { en: string; my: string }
  description: { en: string; my: string }
  annualPriceMmk: number
}

function envPrice(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export const SUBSCRIPTION_TIERS: TierConfig[] = [
  {
    key: 'small',
    sortOrder: 1,
    name: { en: 'Standard', my: 'စံ' },
    description: { en: '10,000 MMK / month', my: 'လစဉ် ၁၀,၀၀၀ ကျပ်' },
    annualPriceMmk: envPrice(import.meta.env.VITE_STATION_SUBSCRIPTION_ANNUAL_MMK, 120000),
  },
]

export function getTierPrice(tier: SubscriptionTierRequested | null | undefined): number | null {
  if (!tier) return null
  return SUBSCRIPTION_TIERS[0].annualPriceMmk
}

export function formatMmk(amount: number): string {
  return `${new Intl.NumberFormat('en-US').format(amount)} MMK`
}
