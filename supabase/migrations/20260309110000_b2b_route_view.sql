-- Phase 3: Route view – stations along a corridor for transport companies.
-- get_my_b2b_entitlements now returns route_name for route_view; get_stations_along_route returns stations in corridor.

-- Return current user's active B2B entitlements (plan_type, route_id, route_name).
CREATE OR REPLACE FUNCTION public.get_my_b2b_entitlements()
RETURNS TABLE (plan_type text, route_id uuid, route_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.plan_type, s.route_id,
    CASE WHEN s.plan_type = 'route_view' AND r.id IS NOT NULL THEN r.name ELSE NULL END
  FROM b2b_subscriptions s
  LEFT JOIN routes r ON r.id = s.route_id AND r.is_active
  WHERE s.user_id = auth.uid()
    AND s.valid_until > now();
$$;

-- Return stations along a route corridor (bbox of waypoints + corridor_km buffer).
-- Caller must have route_view entitlement for this route_id.
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
    AND s.lng BETWEEN v_min_lng AND v_max_lng;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_stations_along_route(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_stations_along_route(uuid) TO anon;
