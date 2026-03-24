-- B2B pricing configuration (admin-controlled) + subscription duration/price snapshots.

CREATE TABLE IF NOT EXISTS public.b2b_pricing_config (
  id text PRIMARY KEY DEFAULT 'default',
  list_price_3m_mmk bigint NOT NULL DEFAULT 36000,
  list_price_6m_mmk bigint NOT NULL DEFAULT 72000,
  list_price_12m_mmk bigint NOT NULL DEFAULT 144000,
  promo_price_3m_mmk bigint NOT NULL DEFAULT 28800,
  promo_price_6m_mmk bigint NOT NULL DEFAULT 57600,
  promo_price_12m_mmk bigint NOT NULL DEFAULT 115200,
  promo_enabled boolean NOT NULL DEFAULT true,
  promo_starts_at timestamptz,
  promo_ends_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT b2b_pricing_positive_prices CHECK (
    list_price_3m_mmk > 0 AND
    list_price_6m_mmk > 0 AND
    list_price_12m_mmk > 0 AND
    promo_price_3m_mmk > 0 AND
    promo_price_6m_mmk > 0 AND
    promo_price_12m_mmk > 0
  ),
  CONSTRAINT b2b_pricing_promo_not_higher CHECK (
    promo_price_3m_mmk <= list_price_3m_mmk AND
    promo_price_6m_mmk <= list_price_6m_mmk AND
    promo_price_12m_mmk <= list_price_12m_mmk
  ),
  CONSTRAINT b2b_pricing_window_valid CHECK (
    promo_starts_at IS NULL OR promo_ends_at IS NULL OR promo_starts_at <= promo_ends_at
  )
);

INSERT INTO public.b2b_pricing_config (id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.b2b_pricing_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS b2b_pricing_select_all ON public.b2b_pricing_config;
CREATE POLICY b2b_pricing_select_all
  ON public.b2b_pricing_config FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS b2b_pricing_update_admin ON public.b2b_pricing_config;
CREATE POLICY b2b_pricing_update_admin
  ON public.b2b_pricing_config FOR UPDATE
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS b2b_pricing_insert_admin ON public.b2b_pricing_config;
CREATE POLICY b2b_pricing_insert_admin
  ON public.b2b_pricing_config FOR INSERT
  TO authenticated
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

ALTER TABLE public.b2b_subscriptions
  ADD COLUMN IF NOT EXISTS duration_months integer NOT NULL DEFAULT 12
    CHECK (duration_months IN (3, 6, 12)),
  ADD COLUMN IF NOT EXISTS price_list_mmk bigint,
  ADD COLUMN IF NOT EXISTS price_promo_mmk bigint,
  ADD COLUMN IF NOT EXISTS price_paid_mmk bigint,
  ADD COLUMN IF NOT EXISTS promo_applied boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS promo_percent numeric(6, 2);

