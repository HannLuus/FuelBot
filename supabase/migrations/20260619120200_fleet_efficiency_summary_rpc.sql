-- Batch efficiency summary for the signed-in user's garage list (one round-trip).

CREATE OR REPLACE FUNCTION public.get_my_fleet_efficiency_summary()
RETURNS TABLE (
  vehicle_id uuid,
  has_sufficient_data boolean,
  samples_count bigint,
  avg_l_per_100km numeric,
  last_l_per_100km numeric
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH my_vehicles AS (
    SELECT v.id
    FROM fleet_vehicles v
    WHERE v.owner_user_id = auth.uid()
      AND v.is_active = true
  ),
  ordered AS (
    SELECT
      fl.vehicle_id,
      fl.filled_at,
      fl.odometer_km,
      fl.liters,
      lag(fl.odometer_km) OVER (
        PARTITION BY fl.vehicle_id ORDER BY fl.filled_at, fl.odometer_km
      ) AS prev_odo
    FROM fuel_logs fl
    JOIN my_vehicles mv ON mv.id = fl.vehicle_id
    WHERE fl.is_full_tank = true
  ),
  intervals AS (
    SELECT
      vehicle_id,
      filled_at,
      liters / (odometer_km - prev_odo) * 100 AS lp100
    FROM ordered
    WHERE prev_odo IS NOT NULL
      AND (odometer_km - prev_odo) > 0
  ),
  clamped AS (
    SELECT vehicle_id, filled_at, lp100
    FROM intervals
    WHERE lp100 BETWEEN 2 AND 200
  ),
  agg AS (
    SELECT
      vehicle_id,
      count(*)::bigint AS samples,
      round(avg(lp100), 1) AS avg_lp100,
      round((array_agg(lp100 ORDER BY filled_at DESC))[1], 1) AS last_lp100
    FROM clamped
    GROUP BY vehicle_id
  )
  SELECT
    mv.id AS vehicle_id,
    coalesce(a.samples, 0) > 0 AS has_sufficient_data,
    coalesce(a.samples, 0) AS samples_count,
    a.avg_lp100 AS avg_l_per_100km,
    a.last_lp100 AS last_l_per_100km
  FROM my_vehicles mv
  LEFT JOIN agg a ON a.vehicle_id = mv.id;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_fleet_efficiency_summary() TO authenticated;
