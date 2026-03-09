-- When operator clicks "I have paid", we set this so admin can see and we avoid duplicate notification emails.
ALTER TABLE public.stations
  ADD COLUMN IF NOT EXISTS payment_reported_at timestamptz;
