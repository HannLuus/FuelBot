-- Store source_role in snapshots so uptime can ignore "out" from crowd/anon (sabotage resistance).
-- Only count an hour as "no fuel" when source was VERIFIED_STATION or TRUSTED.

ALTER TABLE public.station_status_snapshots
  ADD COLUMN IF NOT EXISTS source_role text;

COMMENT ON COLUMN public.station_status_snapshots.source_role IS 'Role that drove the computed status: VERIFIED_STATION, TRUSTED, CROWD, ANON. Used so uptime does not count crowd/anon "out" against the station.';

-- Recreate get_station_uptime to be sabotage-resistant:
-- "with_fuel" = has_any_fuel true (any source)
-- "no_fuel"   = has_any_fuel false AND source_role IN ('VERIFIED_STATION','TRUSTED')
-- Hours where status was "out" from CROWD/ANON are excluded from the denominator (not counted against uptime).
CREATE OR REPLACE FUNCTION public.get_station_uptime(
  p_station_id uuid,
  p_days integer DEFAULT 30
)
RETURNS TABLE (
  has_sufficient_data boolean,
  samples_count bigint,
  expected_samples bigint,
  uptime_pct numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH window_start AS (
    SELECT now() - (p_days || ' days')::interval AS start_at
  ),
  expected AS (
    SELECT (p_days * 24)::bigint AS n
  ),
  samples AS (
    SELECT
      count(*)::bigint AS cnt,
      count(*) FILTER (WHERE has_any_fuel = true)::bigint AS with_fuel,
      count(*) FILTER (WHERE has_any_fuel = false AND source_role IN ('VERIFIED_STATION', 'TRUSTED'))::bigint AS no_fuel_trusted
    FROM station_status_snapshots s, window_start w
    WHERE s.station_id = p_station_id
      AND s.snapshot_at >= w.start_at
  ),
  -- Count only hours we trust: has fuel (any source) or no fuel (verified/trusted source). Ignore "out" from crowd/anon.
  trusted_total AS (
    SELECT (s.with_fuel + s.no_fuel_trusted)::bigint AS total
    FROM samples s
  ),
  sufficient AS (
    SELECT (SELECT cnt FROM samples) >= (e.n * 0.5) AS ok
    FROM expected e
  )
  SELECT
    (SELECT ok FROM sufficient),
    (SELECT total FROM trusted_total),
    (SELECT n FROM expected),
    CASE
      WHEN (SELECT ok FROM sufficient) AND (SELECT total FROM trusted_total) > 0
      THEN round(100.0 * (SELECT with_fuel FROM samples) / NULLIF((SELECT total FROM trusted_total), 0), 1)
      ELSE NULL
    END;
$$;
