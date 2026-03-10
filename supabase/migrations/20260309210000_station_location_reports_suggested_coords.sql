-- Add suggested coordinates and applied_at for crowd-sourced location correction (10 reports → update station).
ALTER TABLE public.station_location_reports
  ADD COLUMN IF NOT EXISTS suggested_lat double precision,
  ADD COLUMN IF NOT EXISTS suggested_lng double precision,
  ADD COLUMN IF NOT EXISTS applied_at timestamptz;

COMMENT ON COLUMN public.station_location_reports.suggested_lat IS 'Driver-reported correct latitude; used with suggested_lng for 10-report consensus.';
COMMENT ON COLUMN public.station_location_reports.suggested_lng IS 'Driver-reported correct longitude.';
COMMENT ON COLUMN public.station_location_reports.applied_at IS 'Set when this report was used in a batch that updated the station; prevents reuse.';

CREATE INDEX IF NOT EXISTS idx_station_location_reports_unapplied
  ON public.station_location_reports(station_id)
  WHERE suggested_lat IS NOT NULL AND suggested_lng IS NOT NULL AND applied_at IS NULL;
