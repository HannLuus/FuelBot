-- CRITICAL-5: Fix broken admin RLS policies on station_claims and station_status_reports.
--
-- The existing "admin all" policies use (auth.jwt() ->> 'role') = 'admin', but the admin
-- role is stored in app_metadata, not the top-level JWT claim. The top-level 'role' claim
-- always equals 'authenticated' for normal users, so these policies NEVER evaluated to true.
-- Correct form: (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
-- This matches the pattern already used in reward_events_admin_policy and payment_config.

-- station_claims: fix admin ALL policy
DROP POLICY IF EXISTS "admin all claims" ON public.station_claims;
CREATE POLICY "admin all claims" ON public.station_claims
  FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- station_status_reports: fix admin ALL policy
DROP POLICY IF EXISTS "admin all reports" ON public.station_status_reports;
CREATE POLICY "admin all reports" ON public.station_status_reports
  FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- station_suggestions: the existing policy uses raw_app_meta_data which is correct,
-- but standardise it to the jwt() form for consistency and to avoid a subquery per row.
DROP POLICY IF EXISTS station_suggestions_admin ON public.station_suggestions;
CREATE POLICY station_suggestions_admin ON public.station_suggestions
  FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
