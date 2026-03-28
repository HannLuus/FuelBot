-- B2B subscriptions: national view and route view (per-route) for paid customers only.
-- Ensures nationwide fuel data is not exposed to the general public.

CREATE TABLE IF NOT EXISTS public.b2b_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_type text NOT NULL CHECK (plan_type IN ('national_view', 'route_view')),
  route_id uuid,
  valid_until timestamptz NOT NULL,
  payment_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS b2b_subscriptions_user_id_valid_until
  ON public.b2b_subscriptions(user_id, valid_until);

ALTER TABLE public.b2b_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS b2b_subscriptions_select_own ON public.b2b_subscriptions;
CREATE POLICY b2b_subscriptions_select_own ON public.b2b_subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- Only admins can insert/update/delete (via service role or admin Edge Functions).
DROP POLICY IF EXISTS b2b_subscriptions_admin_all ON public.b2b_subscriptions;
CREATE POLICY b2b_subscriptions_admin_all ON public.b2b_subscriptions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  );

-- Predefined routes for transport companies (Phase 3: route view).
CREATE TABLE IF NOT EXISTS public.routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  name_my text,
  waypoints jsonb NOT NULL DEFAULT '[]'::jsonb,
  corridor_km numeric(5,2) NOT NULL DEFAULT 25 CHECK (corridor_km >= 5 AND corridor_km <= 100),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'b2b_subscriptions_route_id_fkey' AND conrelid = 'public.b2b_subscriptions'::regclass
  ) THEN
    ALTER TABLE public.b2b_subscriptions
      ADD CONSTRAINT b2b_subscriptions_route_id_fkey
      FOREIGN KEY (route_id) REFERENCES public.routes(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Return current user's active B2B entitlements (plan_type, route_id).
DROP FUNCTION IF EXISTS public.get_my_b2b_entitlements();
CREATE OR REPLACE FUNCTION public.get_my_b2b_entitlements()
RETURNS TABLE (plan_type text, route_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.plan_type, s.route_id
  FROM b2b_subscriptions s
  WHERE s.user_id = auth.uid()
    AND s.valid_until > now();
$$;

GRANT EXECUTE ON FUNCTION public.get_my_b2b_entitlements() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_b2b_entitlements() TO anon;

-- Return all active Myanmar stations with current status; only if caller has national_view entitlement.
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
    AND s.country_code = 'MM';
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_all_stations_national() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_all_stations_national() TO anon;
