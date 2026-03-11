-- Remove duplicate stations: same (name, lat, lng, township, city). Keep one per group.
-- Prefer keeping the row that has verified_owner_id set (claimed station); otherwise keep min(id).
-- Child tables (station_location_reports, station_status_snapshots, referral_rewards) have ON DELETE CASCADE.

WITH dup_key AS (
  SELECT
    id,
    trim(name) AS n,
    lat,
    lng,
    COALESCE(trim(township), '') AS tw,
    COALESCE(trim(city), '') AS ci,
    verified_owner_id
  FROM public.stations
),
ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY n, lat, lng, tw, ci
      ORDER BY (verified_owner_id IS NULL) ASC, id ASC
    ) AS rn
  FROM dup_key
),
ids_to_delete AS (
  SELECT id FROM ranked WHERE rn > 1
)
DELETE FROM public.stations
WHERE id IN (SELECT id FROM ids_to_delete);
