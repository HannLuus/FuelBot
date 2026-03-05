ALTER TABLE public.stations
  ADD COLUMN IF NOT EXISTS registration_reject_reason text,
  ADD COLUMN IF NOT EXISTS registration_rejected_at timestamptz;
