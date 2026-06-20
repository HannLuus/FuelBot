-- Fleet fuel-efficiency benchmark — run once in Studio SQL editor
-- https://studio.fuelbot.lucas-dev-server.tech/project/default/sql/new
--
-- Combines:
--   20260619120000_fleet_efficiency_tables.sql
--   20260619120100_fleet_efficiency_rpcs.sql
--   20260619120200_fleet_efficiency_summary_rpc.sql

-- ── 1. Tables + RLS ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fleet_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.fleet_vehicles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id   uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  asset_type      text NOT NULL DEFAULT 'TRUCK',
  label           text,
  manufacturer    text,
  model           text,
  variant         text,
  year            integer,
  fuel_code       text NOT NULL DEFAULT 'DIESEL',
  engine_size_l   numeric(5,2),
  tank_capacity_l numeric(7,2),
  gvw_class       text,
  body_type       text,
  axle_config     text,
  plate           text,
  region          text,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fleet_vehicles_asset_type_check
    CHECK (asset_type = ANY (ARRAY['TRUCK', 'GENERATOR', 'OTHER'])),
  CONSTRAINT fleet_vehicles_fuel_code_check
    CHECK (fuel_code = ANY (ARRAY['RON92', 'RON95', 'DIESEL', 'PREMIUM_DIESEL'])),
  CONSTRAINT fleet_vehicles_year_check
    CHECK (year IS NULL OR (year >= 1950 AND year <= (EXTRACT(year FROM now())::int + 1))),
  CONSTRAINT fleet_vehicles_engine_size_check
    CHECK (engine_size_l IS NULL OR engine_size_l >= 0),
  CONSTRAINT fleet_vehicles_tank_capacity_check
    CHECK (tank_capacity_l IS NULL OR tank_capacity_l >= 0)
);

ALTER TABLE public.fleet_vehicles OWNER TO postgres;

CREATE INDEX IF NOT EXISTS fleet_vehicles_owner_user_id_idx
  ON public.fleet_vehicles (owner_user_id);
CREATE INDEX IF NOT EXISTS fleet_vehicles_benchmark_group_idx
  ON public.fleet_vehicles (manufacturer, model, year);

CREATE OR REPLACE TRIGGER fleet_vehicles_set_updated_at
  BEFORE UPDATE ON public.fleet_vehicles
  FOR EACH ROW EXECUTE FUNCTION public.fleet_set_updated_at();

CREATE TABLE IF NOT EXISTS public.fuel_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id      uuid NOT NULL REFERENCES public.fleet_vehicles (id) ON DELETE CASCADE,
  owner_user_id   uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  filled_at       timestamptz NOT NULL DEFAULT now(),
  odometer_km     numeric(10,1) NOT NULL,
  liters          numeric(8,2) NOT NULL,
  is_full_tank    boolean NOT NULL DEFAULT true,
  price_paid_mmk  numeric(12,2),
  station_id      uuid REFERENCES public.stations (id) ON DELETE SET NULL,
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fuel_logs_odometer_check CHECK (odometer_km >= 0),
  CONSTRAINT fuel_logs_liters_check CHECK (liters > 0),
  CONSTRAINT fuel_logs_price_check CHECK (price_paid_mmk IS NULL OR price_paid_mmk >= 0),
  CONSTRAINT fuel_logs_note_check CHECK (note IS NULL OR char_length(note) <= 280)
);

ALTER TABLE public.fuel_logs OWNER TO postgres;

CREATE INDEX IF NOT EXISTS fuel_logs_vehicle_filled_at_idx
  ON public.fuel_logs (vehicle_id, filled_at);
CREATE INDEX IF NOT EXISTS fuel_logs_owner_user_id_idx
  ON public.fuel_logs (owner_user_id);
CREATE INDEX IF NOT EXISTS fuel_logs_station_id_idx
  ON public.fuel_logs (station_id);

ALTER TABLE public.fleet_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fuel_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fleet_vehicles_select_own ON public.fleet_vehicles;
CREATE POLICY fleet_vehicles_select_own ON public.fleet_vehicles
  FOR SELECT TO authenticated
  USING (owner_user_id = (select auth.uid()));

DROP POLICY IF EXISTS fleet_vehicles_select_admin ON public.fleet_vehicles;
CREATE POLICY fleet_vehicles_select_admin ON public.fleet_vehicles
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.admin_users a WHERE a.user_id = (select auth.uid())
  ));

DROP POLICY IF EXISTS fleet_vehicles_insert_own ON public.fleet_vehicles;
CREATE POLICY fleet_vehicles_insert_own ON public.fleet_vehicles
  FOR INSERT TO authenticated
  WITH CHECK (owner_user_id = (select auth.uid()));

DROP POLICY IF EXISTS fleet_vehicles_update_own ON public.fleet_vehicles;
CREATE POLICY fleet_vehicles_update_own ON public.fleet_vehicles
  FOR UPDATE TO authenticated
  USING (owner_user_id = (select auth.uid()))
  WITH CHECK (owner_user_id = (select auth.uid()));

DROP POLICY IF EXISTS fleet_vehicles_delete_own ON public.fleet_vehicles;
CREATE POLICY fleet_vehicles_delete_own ON public.fleet_vehicles
  FOR DELETE TO authenticated
  USING (owner_user_id = (select auth.uid()));

DROP POLICY IF EXISTS fleet_vehicles_service_all ON public.fleet_vehicles;
CREATE POLICY fleet_vehicles_service_all ON public.fleet_vehicles
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS fuel_logs_select_own ON public.fuel_logs;
CREATE POLICY fuel_logs_select_own ON public.fuel_logs
  FOR SELECT TO authenticated
  USING (owner_user_id = (select auth.uid()));

DROP POLICY IF EXISTS fuel_logs_select_admin ON public.fuel_logs;
CREATE POLICY fuel_logs_select_admin ON public.fuel_logs
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.admin_users a WHERE a.user_id = (select auth.uid())
  ));

DROP POLICY IF EXISTS fuel_logs_insert_own ON public.fuel_logs;
CREATE POLICY fuel_logs_insert_own ON public.fuel_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    owner_user_id = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.fleet_vehicles v
      WHERE v.id = vehicle_id AND v.owner_user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS fuel_logs_update_own ON public.fuel_logs;
CREATE POLICY fuel_logs_update_own ON public.fuel_logs
  FOR UPDATE TO authenticated
  USING (owner_user_id = (select auth.uid()))
  WITH CHECK (owner_user_id = (select auth.uid()));

DROP POLICY IF EXISTS fuel_logs_delete_own ON public.fuel_logs;
CREATE POLICY fuel_logs_delete_own ON public.fuel_logs
  FOR DELETE TO authenticated
  USING (owner_user_id = (select auth.uid()));

DROP POLICY IF EXISTS fuel_logs_service_all ON public.fuel_logs;
CREATE POLICY fuel_logs_service_all ON public.fuel_logs
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.fleet_vehicles TO authenticated;
GRANT ALL ON TABLE public.fleet_vehicles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.fuel_logs TO authenticated;
GRANT ALL ON TABLE public.fuel_logs TO service_role;

-- ── 2. Analytics RPCs ─────────────────────────────────────────────────────────

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
