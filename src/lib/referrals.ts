import type { SubscriptionTierRequested } from '@/types'
import { getTierPrice } from '@/lib/subscriptionTiers'

export function createReferralCode(seed: string): string {
  const clean = seed.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
  const token = clean.slice(-8).padEnd(8, 'X')
  return `FB-${token}`
}

export function referralAmountForTier(tier: SubscriptionTierRequested | null | undefined): number {
  const price = getTierPrice(tier)
  if (!price) return 0
  return Math.round(price * 0.15)
}
