-- Fix get_my_b2b_entitlements to return a row even if no active routes exist

CREATE OR REPLACE FUNCTION public.get_my_b2b_entitlements()
RETURNS TABLE (plan_type text, route_id uuid, route_name text, valid_until timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- 1. Specific route subscriptions
  SELECT s.plan_type, s.route_id, r.name AS route_name, s.valid_until
  FROM b2b_subscriptions s
  INNER JOIN routes r ON r.id = s.route_id AND r.is_active = true
  WHERE s.user_id = auth.uid()
    AND s.plan_type = 'route_view'
    AND s.route_id IS NOT NULL
    AND s.valid_until > now()
  
  UNION
  
  -- 2. All active routes for users with an "all routes" subscription (route_id IS NULL)
  SELECT s.plan_type, r.id AS route_id, r.name AS route_name, s.valid_until
  FROM b2b_subscriptions s
  CROSS JOIN routes r
  WHERE s.user_id = auth.uid()
    AND s.plan_type = 'route_view'
    AND s.route_id IS NULL
    AND s.valid_until > now()
    AND r.is_active = true
    
  UNION
  
  -- 2b. The base all-routes subscription row (to ensure valid_until is returned even if no routes exist)
  SELECT s.plan_type, s.route_id, NULL::text AS route_name, s.valid_until
  FROM b2b_subscriptions s
  WHERE s.user_id = auth.uid()
    AND s.plan_type = 'route_view'
    AND s.route_id IS NULL
    AND s.valid_until > now()
    
  UNION
  
  -- 3. National view
  SELECT s.plan_type, NULL::uuid AS route_id, NULL::text AS route_name, s.valid_until
  FROM b2b_subscriptions s
  WHERE s.user_id = auth.uid()
    AND s.plan_type = 'national_view'
    AND s.valid_until > now();
$$;

GRANT EXECUTE ON FUNCTION public.get_my_b2b_entitlements() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_b2b_entitlements() TO anon;