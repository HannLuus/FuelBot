-- Only show stations that are verified OR created within the last 3 months.
-- Unverified stations older than 3 months are hidden from map/list until they get a verification source.
-- Visibility: verification_source IS NOT NULL OR is_verified = true OR created_at > now() - interval '3 months'

DROP FUNCTION IF EXISTS public.get_nearby_stations(double precision, double precision, double precision);

CREATE FUNCTION public.get_nearby_stations(user_lat double precision, user_lng double precision, radius_km double precision DEFAULT 5)
RETURNS TABLE(
  id uuid, name text, brand text, lat double precision, lng double precision,
  address_text text, township text, city text, country_code character,
  is_verified boolean, verified_owner_id uuid, verification_source text, is_active boolean,
  created_at timestamp with time zone, updated_at timestamp with time zone,
  distance_m double precision, current_status jsonb
)
LANGUAGE sql
STABLE SECURITY DEFINER
AS $function$
  SELECT
    s.id, s.name, s.brand, s.lat, s.lng, s.address_text,
    s.township, s.city, s.country_code, s.is_verified,
    s.verified_owner_id, s.verification_source, s.is_active, s.created_at, s.updated_at,
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
    AND (s.verification_source IS NOT NULL OR s.is_verified = true OR s.created_at > now() - interval '3 months')
  ORDER BY distance_m ASC
  LIMIT 500;
$function$;

-- B2B route view: same visibility rule
CREATE OR REPLACE FUNCTION public.get_stations_along_route(p_route_id uuid)
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_waypoints jsonb;
  v_corridor_km numeric;
  v_min_lat numeric;
  v_max_lat numeric;
  v_min_lng numeric;
  v_max_lng numeric;
  v_buf numeric;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM b2b_subscriptions
    WHERE user_id = auth.uid()
      AND plan_type = 'route_view'
      AND route_id = p_route_id
      AND valid_until > now()
  ) THEN
    RETURN;
  END IF;

  SELECT waypoints, corridor_km INTO v_waypoints, v_corridor_km
  FROM routes WHERE id = p_route_id AND is_active = true;
  IF v_waypoints IS NULL OR jsonb_array_length(v_waypoints) = 0 THEN
    RETURN;
  END IF;

  SELECT
    min((elem->>'lat')::numeric) - v_corridor_km / 111.0,
    max((elem->>'lat')::numeric) + v_corridor_km / 111.0,
    min((elem->>'lng')::numeric) - v_corridor_km / 111.0,
    max((elem->>'lng')::numeric) + v_corridor_km / 111.0
  INTO v_min_lat, v_max_lat, v_min_lng, v_max_lng
  FROM jsonb_array_elements(v_waypoints) AS elem;

  RETURN QUERY
  SELECT (
    to_jsonb(s)::jsonb || jsonb_build_object(
      'current_status',
      (SELECT to_jsonb(scs) FROM station_current_status scs WHERE scs.station_id = s.id)
    )
  )
  FROM stations s
  WHERE s.is_active = true
    AND s.country_code = 'MM'
    AND s.lat BETWEEN v_min_lat AND v_max_lat
    AND s.lng BETWEEN v_min_lng AND v_max_lng
    AND (s.verification_source IS NOT NULL OR s.is_verified = true OR s.created_at > now() - interval '3 months');
END;
$$;

-- B2B national view: same visibility rule
CREATE OR REPLACE FUNCTION public.get_all_stations_national()
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM b2b_subscriptions
    WHERE user_id = auth.uid()
      AND plan_type = 'national_view'
      AND valid_until > now()
  ) THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT (
    to_jsonb(s)::jsonb || jsonb_build_object(
      'current_status',
      (SELECT to_jsonb(scs) FROM station_current_status scs WHERE scs.station_id = s.id)
    )
  )
  FROM stations s
  WHERE s.is_active = true
    AND s.country_code = 'MM'
    AND (s.verification_source IS NOT NULL OR s.is_verified = true OR s.created_at > now() - interval '3 months');
END;
$$;
