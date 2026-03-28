-- Quality pass: resolve remaining linter items (search_path, explicit roles on permissive policies, missing indexes).

-- 1) Function search_path mutable: enforce search_path at the DB level for the active signature.
ALTER FUNCTION public.get_nearby_stations(double precision, double precision, double precision)
  SET search_path = public;

-- 2) Explicitly scope intentionally-open INSERT policies to anon/authenticated.
-- This keeps the same behavior but avoids accidental broad role exposure.
DROP POLICY IF EXISTS station_location_reports_insert ON public.station_location_reports;
CREATE POLICY station_location_reports_insert ON public.station_location_reports
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "insert report" ON public.station_status_reports;
CREATE POLICY "insert report" ON public.station_status_reports
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "insert vote" ON public.status_votes;
CREATE POLICY "insert vote" ON public.status_votes
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- 3) Remaining unindexed foreign keys.
CREATE INDEX IF NOT EXISTS stations_verified_owner_id_idx ON public.stations (verified_owner_id);
CREATE INDEX IF NOT EXISTS status_votes_user_id_idx ON public.status_votes (user_id);
