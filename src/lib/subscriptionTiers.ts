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
    name: { en: 'Small', my: 'အသေး' },
    description: { en: '1–2 dispensers', my: 'ပമ്പ် ၁–၂ ခု' },
    annualPriceMmk: envPrice(import.meta.env.VITE_TIER_PRICE_SMALL_MMK, 500000),
  },
  {
    key: 'medium',
    sortOrder: 2,
    name: { en: 'Medium', my: 'အလတ်' },
    description: { en: '3–5 dispensers', my: 'ပമ്പ် ၃–၅ ခု' },
    annualPriceMmk: envPrice(import.meta.env.VITE_TIER_PRICE_MEDIUM_MMK, 1200000),
  },
  {
    key: 'large',
    sortOrder: 3,
    name: { en: 'Large', my: 'အကြီး' },
    description: { en: '6+ dispensers', my: 'ပമ്പ် ၆ ခုနှင့်အထက်' },
    annualPriceMmk: envPrice(import.meta.env.VITE_TIER_PRICE_LARGE_MMK, 2500000),
  },
]

export function getTierPrice(tier: SubscriptionTierRequested | null | undefined): number | null {
  if (!tier) return null
  return SUBSCRIPTION_TIERS.find((t) => t.key === tier)?.annualPriceMmk ?? null
}

export function formatMmk(amount: number): string {
  return `${new Intl.NumberFormat('en-US').format(amount)} MMK`
}
