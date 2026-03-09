-- Increase get_nearby_stations limit from 50 to 500 so more stations show within the selected radius.
-- Also require location IS NOT NULL so only spatially indexed rows are returned.

CREATE OR REPLACE FUNCTION public.get_nearby_stations(user_lat double precision, user_lng double precision, radius_km double precision DEFAULT 5)
RETURNS TABLE(
  id uuid, name text, brand text, lat double precision, lng double precision,
  address_text text, township text, city text, country_code character,
  is_verified boolean, verified_owner_id uuid, is_active boolean,
  created_at timestamp with time zone, updated_at timestamp with time zone,
  distance_m double precision, current_status jsonb
)
LANGUAGE sql
STABLE SECURITY DEFINER
AS $function$
  SELECT
    s.id, s.name, s.brand, s.lat, s.lng, s.address_text,
    s.township, s.city, s.country_code, s.is_verified,
    s.verified_owner_id, s.is_active, s.created_at, s.updated_at,
    ST_Distance(s.location, ST_MakePoint(user_lng, user_lat)::geography) AS distance_m,
    CASE WHEN cs.station_id IS NOT NULL THEN
      jsonb_build_object(
        'station_id', cs.station_id,
        'fuel_statuses_computed', cs.fuel_statuses_computed,
        'queue_bucket_computed', cs.queue_bucket_computed,
        'confidence_score', cs.confidence_score,
        'source_role', cs.source_role,
        'last_updated_at', cs.last_updated_at,
        'is_stale', cs.is_stale
      )
    ELSE NULL END AS current_status
  FROM stations s
  LEFT JOIN station_current_status cs ON cs.station_id = s.id
  WHERE
    s.is_active = true
    AND s.location IS NOT NULL
    AND ST_DWithin(s.location, ST_MakePoint(user_lng, user_lat)::geography, radius_km * 1000)
  ORDER BY distance_m ASC
  LIMIT 500;
$function$;
