-- Operator payment flow aligned with B2B: station owner reports payment_method, payment_reference, optional screenshot

ALTER TABLE public.stations
  ADD COLUMN IF NOT EXISTS payment_screenshot_path text;
