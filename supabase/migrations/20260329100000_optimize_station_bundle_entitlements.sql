-- Evaluate station_owner_route_bundle_valid_until() once per get_my_b2b_entitlements query (branch 4).
-- Evaluate it once per get_stations_along_route call (reuse in gate).

CREATE OR REPLACE FUNCTION public.get_my_b2b_entitlements()
RETURNS TABLE (plan_type text, route_id uuid, route_name text, valid_until timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.plan_type, s.route_id, r.name AS route_name, s.valid_until
  FROM b2b_subscriptions s
  INNER JOIN routes r ON r.id = s.route_id AND r.is_active = true
  WHERE s.user_id = auth.uid()
    AND s.plan_type = 'route_view'
    AND s.route_id IS NOT NULL
    AND s.valid_until > now()
    AND s.status = 'CONFIRMED'

  UNION

  SELECT s.plan_type, r.id AS route_id, r.name AS route_name, s.valid_until
  FROM b2b_subscriptions s
  CROSS JOIN routes r
  WHERE s.user_id = auth.uid()
    AND s.plan_type = 'route_view'
    AND s.route_id IS NULL
    AND s.valid_until > now()
    AND s.status = 'CONFIRMED'
    AND r.is_active = true

  UNION

  SELECT s.plan_type, s.route_id, NULL::text AS route_name, s.valid_until
  FROM b2b_subscriptions s
  WHERE s.user_id = auth.uid()
    AND s.plan_type = 'route_view'
    AND s.route_id IS NULL
    AND s.valid_until > now()
    AND s.status = 'CONFIRMED'

  UNION

  SELECT s.plan_type, NULL::uuid AS route_id, NULL::text AS route_name, s.valid_until
  FROM b2b_subscriptions s
  WHERE s.user_id = auth.uid()
    AND s.plan_type = 'national_view'
    AND s.valid_until > now()
    AND s.status = 'CONFIRMED'

  UNION

  SELECT
    'route_view'::text,
    r.id,
    r.name,
    u.until
  FROM (SELECT public.station_owner_route_bundle_valid_until() AS until) u
  CROSS JOIN routes r
  WHERE r.is_active = true
    AND u.until IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_b2b_entitlements() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_b2b_entitlements() TO anon;


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
  v_b2b_ok boolean;
  v_station_bundle_ok boolean;
  v_bundle_until timestamptz;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM b2b_subscriptions
    WHERE user_id = auth.uid()
      AND plan_type = 'route_view'
      AND (route_id = p_route_id OR route_id IS NULL)
      AND valid_until > now()
      AND status = 'CONFIRMED'
  ) INTO v_b2b_ok;

  SELECT public.station_owner_route_bundle_valid_until() INTO v_bundle_until;

  SELECT EXISTS (
    SELECT 1 FROM routes
    WHERE id = p_route_id AND is_active = true
  )
    AND v_bundle_until IS NOT NULL
  INTO v_station_bundle_ok;

  IF NOT (v_b2b_ok OR v_station_bundle_ok) THEN
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

GRANT EXECUTE ON FUNCTION public.get_stations_along_route(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_stations_along_route(uuid) TO anon;
