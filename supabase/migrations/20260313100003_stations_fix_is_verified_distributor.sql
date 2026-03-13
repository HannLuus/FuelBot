-- Fix: is_verified must only be true for stations where the owner has paid and admin has approved.
-- Distributor-sourced stations (from SCRAPE1.csv or any distributor import) are verified on Google
-- (shown via verification_source = 'distributor'), but they have NOT paid for owner features.
-- Reset is_verified = false for all distributor stations that have no paying owner.
UPDATE public.stations
SET is_verified = false,
    updated_at  = now()
WHERE verification_source = 'distributor'
  AND verified_owner_id IS NULL;
