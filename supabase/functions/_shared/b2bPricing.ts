export interface B2BPricingConfigRow {
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

export interface B2BPricingQuote {
  durationMonths: 3 | 6 | 12
  listPriceMmk: number
  promoPriceMmk: number
  paidPriceMmk: number
  promoApplied: boolean
  promoPercent: number
}

export function isPromoActive(row: B2BPricingConfigRow, now = new Date()): boolean {
  if (!row.promo_enabled) return false
  const startOk = !row.promo_starts_at || new Date(row.promo_starts_at) <= now
  const endOk = !row.promo_ends_at || new Date(row.promo_ends_at) >= now
  return startOk && endOk
}

export function quoteB2BPrice(row: B2BPricingConfigRow, durationMonths: 3 | 6 | 12): B2BPricingQuote {
  const listPriceMmk = durationMonths === 3
    ? Number(row.list_price_3m_mmk)
    : durationMonths === 6
      ? Number(row.list_price_6m_mmk)
      : Number(row.list_price_12m_mmk)
  const promoPriceMmk = durationMonths === 3
    ? Number(row.promo_price_3m_mmk)
    : durationMonths === 6
      ? Number(row.promo_price_6m_mmk)
      : Number(row.promo_price_12m_mmk)
  const promoApplied = isPromoActive(row)
  const paidPriceMmk = promoApplied ? promoPriceMmk : listPriceMmk
  const promoPercent = listPriceMmk > 0 ? Math.round(((listPriceMmk - promoPriceMmk) / listPriceMmk) * 10000) / 100 : 0
  return {
    durationMonths,
    listPriceMmk,
    promoPriceMmk,
    paidPriceMmk,
    promoApplied,
    promoPercent,
  }
}

