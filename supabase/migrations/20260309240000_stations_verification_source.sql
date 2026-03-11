-- Clear definition of "verified": only distributor list, crowd (10 reports), or owner (claim + pay).
-- Unverified stations should be shown grey until they get one of these.
ALTER TABLE public.stations
  ADD COLUMN IF NOT EXISTS verification_source text;

ALTER TABLE public.stations
  DROP CONSTRAINT IF EXISTS stations_verification_source_check;

ALTER TABLE public.stations
  ADD CONSTRAINT stations_verification_source_check
  CHECK (verification_source IS NULL OR verification_source IN ('distributor', 'crowd', 'owner'));

COMMENT ON COLUMN public.stations.verification_source IS 'distributor = from official list (Max, Denko, BOC, etc.); crowd = 10 location reports applied; owner = claim + payment approved. Null = unverified, show grey.';
