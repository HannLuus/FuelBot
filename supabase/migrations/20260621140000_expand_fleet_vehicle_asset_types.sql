-- Reposition fleet efficiency from truck-only to generic fleet vehicles.
-- Existing TRUCK / GENERATOR / OTHER rows remain valid.

ALTER TABLE public.fleet_vehicles
  ALTER COLUMN asset_type SET DEFAULT 'CAR';

ALTER TABLE public.fleet_vehicles
  DROP CONSTRAINT IF EXISTS fleet_vehicles_asset_type_check;

ALTER TABLE public.fleet_vehicles
  ADD CONSTRAINT fleet_vehicles_asset_type_check
  CHECK (
    asset_type = ANY (
      ARRAY[
        'CAR',
        'MOTORCYCLE',
        'VAN',
        'PICKUP',
        'BUS',
        'TRUCK',
        'GENERATOR',
        'OTHER'
      ]
    )
  );
