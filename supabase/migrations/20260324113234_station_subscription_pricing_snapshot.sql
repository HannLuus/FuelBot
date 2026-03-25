-- Operator station subscription: persist duration and B2B-aligned price snapshot when payment is reported.

ALTER TABLE public.stations
  ADD COLUMN IF NOT EXISTS subscription_duration_months integer
    CHECK (subscription_duration_months IS NULL OR subscription_duration_months IN (3, 6, 12)),
  ADD COLUMN IF NOT EXISTS subscription_price_list_mmk bigint,
  ADD COLUMN IF NOT EXISTS subscription_price_promo_mmk bigint,
  ADD COLUMN IF NOT EXISTS subscription_price_paid_mmk bigint,
  ADD COLUMN IF NOT EXISTS subscription_promo_applied boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS subscription_promo_percent numeric(6, 2);

COMMENT ON COLUMN public.stations.subscription_duration_months IS
  'Plan length (months) when operator reported payment; used for admin invoice and referral base.';
COMMENT ON COLUMN public.stations.subscription_price_paid_mmk IS
  'Tax-inclusive total MMK snapshot at report time (from b2b_pricing_config quote).';
