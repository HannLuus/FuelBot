import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

export type B2BDurationMonths = 3 | 6 | 12

export interface B2BPricingConfig {
  list_price_3m_mmk: number
  list_price_6m_mmk: number
  list_price_12m_mmk: number
  promo_price_3m_mmk: number
  promo_price_6m_mmk: number
  promo_price_12m_mmk: number
  promo_enabled: boolean
  promo_starts_at: string | null
  promo_ends_at: string | null
}

const DEFAULT_CONFIG: B2BPricingConfig = {
  list_price_3m_mmk: 36000,
  list_price_6m_mmk: 72000,
  list_price_12m_mmk: 144000,
  promo_price_3m_mmk: 28800,
  promo_price_6m_mmk: 57600,
  promo_price_12m_mmk: 115200,
  promo_enabled: true,
  promo_starts_at: null,
  promo_ends_at: null,
}

export function isPromoActive(cfg: B2BPricingConfig, now = new Date()): boolean {
  if (!cfg.promo_enabled) return false
  const startOk = !cfg.promo_starts_at || new Date(cfg.promo_starts_at) <= now
  const endOk = !cfg.promo_ends_at || new Date(cfg.promo_ends_at) >= now
  return startOk && endOk
}

export function quoteB2BPrice(cfg: B2BPricingConfig, duration: B2BDurationMonths) {
  const list = duration === 3 ? cfg.list_price_3m_mmk : duration === 6 ? cfg.list_price_6m_mmk : cfg.list_price_12m_mmk
  const promo = duration === 3 ? cfg.promo_price_3m_mmk : duration === 6 ? cfg.promo_price_6m_mmk : cfg.promo_price_12m_mmk
  const promoOn = isPromoActive(cfg)
  const paid = promoOn ? promo : list
  const savings = Math.max(0, list - paid)
  const promoPercent = list > 0 ? Math.round(((list - promo) / list) * 10000) / 100 : 0
  return { list, promo, paid, savings, promoPercent, promoOn }
}

export function useB2BPricing() {
  const [config, setConfig] = useState<B2BPricingConfig>(DEFAULT_CONFIG)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('b2b_pricing_config')
      .select('list_price_3m_mmk, list_price_6m_mmk, list_price_12m_mmk, promo_price_3m_mmk, promo_price_6m_mmk, promo_price_12m_mmk, promo_enabled, promo_starts_at, promo_ends_at')
      .eq('id', 'default')
      .maybeSingle()
    if (data) {
      setConfig({
        list_price_3m_mmk: Number(data.list_price_3m_mmk ?? DEFAULT_CONFIG.list_price_3m_mmk),
        list_price_6m_mmk: Number(data.list_price_6m_mmk ?? DEFAULT_CONFIG.list_price_6m_mmk),
        list_price_12m_mmk: Number(data.list_price_12m_mmk ?? DEFAULT_CONFIG.list_price_12m_mmk),
        promo_price_3m_mmk: Number(data.promo_price_3m_mmk ?? DEFAULT_CONFIG.promo_price_3m_mmk),
        promo_price_6m_mmk: Number(data.promo_price_6m_mmk ?? DEFAULT_CONFIG.promo_price_6m_mmk),
        promo_price_12m_mmk: Number(data.promo_price_12m_mmk ?? DEFAULT_CONFIG.promo_price_12m_mmk),
        promo_enabled: Boolean(data.promo_enabled ?? DEFAULT_CONFIG.promo_enabled),
        promo_starts_at: data.promo_starts_at ?? null,
        promo_ends_at: data.promo_ends_at ?? null,
      })
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    // Mirrors existing async data hooks in this codebase.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh()
  }, [refresh])

  const promoOn = useMemo(() => isPromoActive(config), [config])
  return { config, loading, refresh, promoOn }
}

