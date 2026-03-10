-- Allow address-only stations: no map pin until real coordinates are set.
-- get_nearby_stations already filters by location IS NOT NULL so address-only rows never appear on the map.

ALTER TABLE public.stations
  ALTER COLUMN lat DROP NOT NULL,
  ALTER COLUMN lng DROP NOT NULL;

-- If location is a separate column (geography), allow null when lat/lng are null
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'stations' AND column_name = 'location'
  ) THEN
    EXECUTE 'ALTER TABLE public.stations ALTER COLUMN location DROP NOT NULL';
  END IF;
END $$;

COMMENT ON COLUMN public.stations.lat IS 'Physical latitude; null = address-only station, not shown on map until geocoded.';
COMMENT ON COLUMN public.stations.lng IS 'Physical longitude; null = address-only station, not shown on map until geocoded.';
