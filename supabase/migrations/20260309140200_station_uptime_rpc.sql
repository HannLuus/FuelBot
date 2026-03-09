-- Option B: Uptime from snapshots (fuel availability over time).
-- Requires at least ~50% of expected hourly samples in the window to return a value.

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
      count(*) FILTER (WHERE has_any_fuel = true)::bigint AS with_fuel
    FROM station_status_snapshots s, window_start w
    WHERE s.station_id = p_station_id
      AND s.snapshot_at >= w.start_at
  ),
  sufficient AS (
    SELECT
      s.cnt >= (e.n * 0.5) AS ok
    FROM samples s, expected e
  )
  SELECT
    (SELECT ok FROM sufficient),
    (SELECT cnt FROM samples),
    (SELECT n FROM expected),
    CASE
      WHEN (SELECT ok FROM sufficient) AND (SELECT cnt FROM samples) > 0
      THEN round(100.0 * (SELECT with_fuel FROM samples) / NULLIF((SELECT cnt FROM samples), 0), 1)
      ELSE NULL
    END;
$$;

GRANT EXECUTE ON FUNCTION public.get_station_uptime(uuid, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.get_station_uptime(uuid, integer) TO authenticated;
