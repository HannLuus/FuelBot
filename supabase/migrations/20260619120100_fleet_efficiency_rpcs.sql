-- Fleet efficiency analytics RPCs.
-- L/100km is only meaningful between two consecutive full-tank fills:
--   L/100km = liters(at end of interval) / (odometer_end - odometer_start) * 100
-- Outliers outside a sane band (2..200 L/100km) are dropped so typos don't poison results.

-- ── Per-vehicle efficiency (SECURITY INVOKER: RLS restricts to caller's own logs) ──
CREATE OR REPLACE FUNCTION public.get_vehicle_efficiency(
  p_vehicle_id uuid
)
RETURNS TABLE (
  has_sufficient_data boolean,
  samples_count bigint,
  avg_l_per_100km numeric,
  last_l_per_100km numeric,
  best_l_per_100km numeric,
  total_distance_km numeric
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH ordered AS (
    SELECT
      fl.filled_at,
      fl.odometer_km,
      fl.liters,
      lag(fl.odometer_km) OVER (ORDER BY fl.filled_at, fl.odometer_km) AS prev_odo
    FROM fuel_logs fl
    WHERE fl.vehicle_id = p_vehicle_id
      AND fl.is_full_tank = true
  ),
  intervals AS (
    SELECT
      filled_at,
      (odometer_km - prev_odo) AS dist_km,
      liters / (odometer_km - prev_odo) * 100 AS lp100
    FROM ordered
    WHERE prev_odo IS NOT NULL
      AND (odometer_km - prev_odo) > 0
  ),
  clamped AS (
    SELECT filled_at, dist_km, lp100
    FROM intervals
    WHERE lp100 BETWEEN 2 AND 200
  )
  SELECT
    (count(*) > 0) AS has_sufficient_data,
    count(*)::bigint AS samples_count,
    round(avg(lp100), 1) AS avg_l_per_100km,
    round((SELECT c.lp100 FROM clamped c ORDER BY c.filled_at DESC LIMIT 1), 1) AS last_l_per_100km,
    round(min(lp100), 1) AS best_l_per_100km,
    round(sum(dist_km), 1) AS total_distance_km
  FROM clamped;
$$;

GRANT EXECUTE ON FUNCTION public.get_vehicle_efficiency(uuid) TO authenticated;

-- ── Anonymized peer benchmark (SECURITY DEFINER: aggregates across owners) ─────
-- Returns aggregates ONLY, and only when at least 3 distinct owners contribute.
-- Never exposes other fleets' raw rows or plates.
CREATE OR REPLACE FUNCTION public.get_fleet_benchmark(
  p_manufacturer text,
  p_model text,
  p_year integer DEFAULT NULL,
  p_region text DEFAULT NULL
)
RETURNS TABLE (
  has_sufficient_data boolean,
  peer_vehicles_count bigint,
  peer_owners_count bigint,
  avg_l_per_100km numeric,
  p25_l_per_100km numeric,
  p75_l_per_100km numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH matched AS (
    SELECT v.id, v.owner_user_id
    FROM fleet_vehicles v
    WHERE v.is_active = true
      AND v.manufacturer IS NOT NULL
      AND lower(v.manufacturer) = lower(p_manufacturer)
      AND v.model IS NOT NULL
      AND lower(v.model) = lower(p_model)
      AND (p_year IS NULL OR v.year = p_year)
      AND (p_region IS NULL OR (v.region IS NOT NULL AND lower(v.region) = lower(p_region)))
  ),
  ordered AS (
    SELECT
      fl.vehicle_id,
      m.owner_user_id,
      fl.filled_at,
      fl.odometer_km,
      fl.liters,
      lag(fl.odometer_km) OVER (PARTITION BY fl.vehicle_id ORDER BY fl.filled_at, fl.odometer_km) AS prev_odo
    FROM fuel_logs fl
    JOIN matched m ON m.id = fl.vehicle_id
    WHERE fl.is_full_tank = true
  ),
  intervals AS (
    SELECT
      vehicle_id,
      owner_user_id,
      liters / (odometer_km - prev_odo) * 100 AS lp100
    FROM ordered
    WHERE prev_odo IS NOT NULL
      AND (odometer_km - prev_odo) > 0
  ),
  clamped AS (
    SELECT vehicle_id, owner_user_id, lp100
    FROM intervals
    WHERE lp100 BETWEEN 2 AND 200
  ),
  agg AS (
    SELECT
      count(DISTINCT vehicle_id)::bigint AS vehicles,
      count(DISTINCT owner_user_id)::bigint AS owners,
      round(avg(lp100), 1) AS avg_lp100,
      round(percentile_cont(0.25) WITHIN GROUP (ORDER BY lp100)::numeric, 1) AS p25,
      round(percentile_cont(0.75) WITHIN GROUP (ORDER BY lp100)::numeric, 1) AS p75
    FROM clamped
  )
  SELECT
    (owners >= 3) AS has_sufficient_data,
    CASE WHEN owners >= 3 THEN vehicles ELSE 0 END,
    CASE WHEN owners >= 3 THEN owners ELSE 0 END,
    CASE WHEN owners >= 3 THEN avg_lp100 ELSE NULL END,
    CASE WHEN owners >= 3 THEN p25 ELSE NULL END,
    CASE WHEN owners >= 3 THEN p75 ELSE NULL END
  FROM agg;
$$;

GRANT EXECUTE ON FUNCTION public.get_fleet_benchmark(text, text, integer, text) TO authenticated;
