-- Enforce payment proof for station claims.
-- A pending claim must include a payment screenshot path.

ALTER TABLE public.station_claims
  ADD COLUMN IF NOT EXISTS payment_screenshot_path text;

-- Existing pending claims without screenshot are invalid under new policy.
UPDATE public.station_claims
SET
  status = 'REJECTED',
  reviewed_at = COALESCE(reviewed_at, now())
WHERE status = 'PENDING'
  AND (payment_screenshot_path IS NULL OR btrim(payment_screenshot_path) = '');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'station_claims_pending_requires_screenshot'
  ) THEN
    ALTER TABLE public.station_claims
      ADD CONSTRAINT station_claims_pending_requires_screenshot
      CHECK (
        status <> 'PENDING'
        OR (payment_screenshot_path IS NOT NULL AND btrim(payment_screenshot_path) <> '')
      );
  END IF;
END
$$;
