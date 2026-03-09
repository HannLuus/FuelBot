-- Option B: Historical snapshots for uptime (fuel availability over time).
-- A scheduled job (e.g. Edge Function snapshot-station-statuses hourly) inserts rows.

CREATE TABLE IF NOT EXISTS public.station_status_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id uuid NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
  snapshot_at timestamptz NOT NULL DEFAULT now(),
  fuel_statuses_computed jsonb,
  has_any_fuel boolean GENERATED ALWAYS AS (
    (fuel_statuses_computed IS NOT NULL)
    AND (
      (fuel_statuses_computed->>'RON92') IN ('AVAILABLE', 'LIMITED')
      OR (fuel_statuses_computed->>'RON95') IN ('AVAILABLE', 'LIMITED')
      OR (fuel_statuses_computed->>'DIESEL') IN ('AVAILABLE', 'LIMITED')
      OR (fuel_statuses_computed->>'PREMIUM_DIESEL') IN ('AVAILABLE', 'LIMITED')
    )
  ) STORED
);

CREATE INDEX IF NOT EXISTS idx_station_status_snapshots_station_snapshot
  ON public.station_status_snapshots (station_id, snapshot_at DESC);

COMMENT ON TABLE public.station_status_snapshots IS 'Hourly snapshots of station_current_status for uptime calculation.';
