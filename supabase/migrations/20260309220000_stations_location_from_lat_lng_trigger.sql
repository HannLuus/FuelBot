-- Keep stations.location in sync when lat/lng are updated (e.g. by report-wrong-location or owner-update-station-location).
-- get_nearby_stations uses s.location for spatial queries, so it must be set when lat/lng change.
CREATE OR REPLACE FUNCTION public.sync_station_location_from_lat_lng()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL THEN
    NEW.location := ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326)::geography;
  ELSE
    NEW.location := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_station_location_trigger ON public.stations;
CREATE TRIGGER sync_station_location_trigger
  BEFORE INSERT OR UPDATE OF lat, lng ON public.stations
  FOR EACH ROW
  EXECUTE PROCEDURE public.sync_station_location_from_lat_lng();
