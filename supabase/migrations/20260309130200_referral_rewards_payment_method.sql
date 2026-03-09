-- Store payment method when admin marks a referral reward as paid (matches stations.payment_method).
ALTER TABLE public.referral_rewards
  ADD COLUMN IF NOT EXISTS payment_method text;
