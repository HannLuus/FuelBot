-- Unified display TTL: 48 hours for all reporter roles.
-- Report expires_at (set by submit-report) and compute_station_status staleness/confidence
-- both use role_decay_seconds(); keeping one value avoids mismatch.
-- After 48h with no fresh report, aggregation shows empty / stale (see compute_station_status).

CREATE OR REPLACE FUNCTION public.role_decay_seconds(role reporter_role)
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN 172800; -- 48 * 3600
END;
$function$;

COMMENT ON FUNCTION public.role_decay_seconds(reporter_role) IS
  'Seconds a status report is treated as current for aggregation and UI staleness (48h as of 2026-03).';

-- Align existing rows with the new window so recent reports are not dropped early.
UPDATE public.station_status_reports
SET expires_at = reported_at + interval '48 hours'
WHERE is_flagged = false;

-- Refresh computed status for all active stations (uses new decay + updated expires_at).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public.stations WHERE is_active = true LOOP
    PERFORM public.compute_station_status(r.id);
  END LOOP;
END $$;
