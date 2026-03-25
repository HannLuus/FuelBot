-- Prevent duplicate pending claims by the same user for the same station.
-- 1) Clean up existing duplicate pending rows (keep earliest pending, mark later duplicates rejected).
-- 2) Enforce uniqueness for future pending claims.

WITH ranked_pending AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, station_id
      ORDER BY submitted_at ASC, id ASC
    ) AS rn
  FROM public.station_claims
  WHERE status = 'PENDING'
)
UPDATE public.station_claims sc
SET
  status = 'REJECTED',
  reviewed_at = COALESCE(sc.reviewed_at, now())
FROM ranked_pending rp
WHERE sc.id = rp.id
  AND rp.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS station_claims_pending_user_station_unique
  ON public.station_claims (user_id, station_id)
  WHERE status = 'PENDING';
