-- Fleet fuel-efficiency benchmark: vehicle (generic asset) registry + manual fill-up logs.
-- Free value magnet for transport companies; paid upsell stays B2B route/national map access.

-- ── updated_at trigger helper (first generic one in this project) ──────────────
CREATE OR REPLACE FUNCTION public.fleet_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ── fleet_vehicles: the "machine" (generic asset; trucks first) ────────────────
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
-- Supports get_fleet_benchmark peer grouping.
CREATE INDEX IF NOT EXISTS fleet_vehicles_benchmark_group_idx
  ON public.fleet_vehicles (manufacturer, model, year);

CREATE OR REPLACE TRIGGER fleet_vehicles_set_updated_at
  BEFORE UPDATE ON public.fleet_vehicles
  FOR EACH ROW EXECUTE FUNCTION public.fleet_set_updated_at();

-- ── fuel_logs: one manual fill-up entry ───────────────────────────────────────
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

-- ── Row Level Security ─────────────────────────────────────────────────────────
ALTER TABLE public.fleet_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fuel_logs ENABLE ROW LEVEL SECURITY;

-- fleet_vehicles: owner full CRUD on own rows; admin read-all; service role all.
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

-- fuel_logs: owner full CRUD on own rows; admin read-all; service role all.
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

-- ── Grants (RLS still governs row access) ──────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.fleet_vehicles TO authenticated;
GRANT ALL ON TABLE public.fleet_vehicles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.fuel_logs TO authenticated;
GRANT ALL ON TABLE public.fuel_logs TO service_role;
