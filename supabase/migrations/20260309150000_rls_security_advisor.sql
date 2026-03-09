-- Security Advisor: enable RLS on public tables that were missing it.
-- Policies are minimal: only the access patterns used by the app are allowed.

-- admin_users: used to check "is current user an admin?" (e.g. in referral_rewards_select_admin).
-- Allow authenticated users to SELECT their own row only.
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_users_select_own ON public.admin_users;
CREATE POLICY admin_users_select_own ON public.admin_users
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- No INSERT/UPDATE/DELETE for anon or authenticated; admin management uses service role in Edge Functions.


-- spatial_ref_sys: PostGIS system table owned by supabase_admin; we cannot enable RLS (must be owner).
-- See migration 20260309150100_spatial_ref_sys_revoke_public.sql: we revoke anon/authenticated access instead.


-- station_status_snapshots: written by cron (service role), read only via get_station_uptime (SECURITY DEFINER).
-- Enable RLS and allow no direct access from anon/authenticated; RPC and service role bypass.
ALTER TABLE public.station_status_snapshots ENABLE ROW LEVEL SECURITY;

-- No policies: direct table access from PostgREST is denied. Edge Function and get_station_uptime use service role / definer.


-- routes: reference data for B2B route selector. Read-only for anon and authenticated.
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS routes_select_active ON public.routes;
CREATE POLICY routes_select_active ON public.routes
  FOR SELECT
  USING (true);


-- referral_codes: each user has at most one row (user_id PK). get-referral-code Edge Function reads/upserts by user.
-- Allow authenticated to SELECT and INSERT/UPDATE only their own row.
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS referral_codes_select_own ON public.referral_codes;
CREATE POLICY referral_codes_select_own ON public.referral_codes
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS referral_codes_insert_own ON public.referral_codes;
CREATE POLICY referral_codes_insert_own ON public.referral_codes
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS referral_codes_update_own ON public.referral_codes;
CREATE POLICY referral_codes_update_own ON public.referral_codes
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- Security Advisor: function search_path mutable (set explicit search_path on public functions).
ALTER FUNCTION public.role_decay_seconds(reporter_role) SET search_path = public;
ALTER FUNCTION public.role_base_weight(reporter_role) SET search_path = public;
ALTER FUNCTION public.compute_station_status(uuid) SET search_path = public;
ALTER FUNCTION public.get_nearby_stations(double precision, double precision, double precision) SET search_path = public;
ALTER FUNCTION public.trigger_recompute_on_report() SET search_path = public;
ALTER FUNCTION public.trigger_recompute_on_vote() SET search_path = public;
