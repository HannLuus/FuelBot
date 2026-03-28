-- Operator/Admin/Referral foundation for tiered subscriptions, payment review,
-- referral rewards, transparency markers, and recognition photos.

ALTER TABLE public.stations
  ADD COLUMN IF NOT EXISTS subscription_tier_requested text,
  ADD COLUMN IF NOT EXISTS payment_received_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS payment_reference text,
  ADD COLUMN IF NOT EXISTS payment_confirmed_by uuid,
  ADD COLUMN IF NOT EXISTS referrer_user_id uuid,
  ADD COLUMN IF NOT EXISTS station_photo_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS location_photo_url text,
  ADD COLUMN IF NOT EXISTS referral_paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS referral_reward_status text,
  ADD COLUMN IF NOT EXISTS recognition_photo_url text,
  ADD COLUMN IF NOT EXISTS recognition_photo_confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recognition_photo_updated_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conname = 'stations_subscription_tier_requested_check'
  ) THEN
    ALTER TABLE public.stations
      ADD CONSTRAINT stations_subscription_tier_requested_check
      CHECK (subscription_tier_requested IN ('small', 'medium', 'large') OR subscription_tier_requested IS NULL);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conname = 'stations_referral_reward_status_check'
  ) THEN
    ALTER TABLE public.stations
      ADD CONSTRAINT stations_referral_reward_status_check
      CHECK (referral_reward_status IN ('PENDING', 'PAID', 'COLLECTED') OR referral_reward_status IS NULL);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.referral_codes (
  user_id uuid PRIMARY KEY,
  code text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.referral_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id uuid NOT NULL,
  station_id uuid NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
  amount_mmk numeric(12,2) NOT NULL CHECK (amount_mmk >= 0),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAID', 'COLLECTED')),
  payment_reference text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS referral_rewards_station_unique
  ON public.referral_rewards(station_id);

CREATE TABLE IF NOT EXISTS public.admin_users (
  user_id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
