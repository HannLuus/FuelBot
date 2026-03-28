-- Quality pass: RLS hardening for service-role-only tables/policies + performance indexes.

-- 1) Fix permissive service-role policies that were missing an explicit TO role.
-- These policies are intended for service_role only.
DROP POLICY IF EXISTS "service role manage status" ON public.station_current_status;
CREATE POLICY "service role manage status" ON public.station_current_status
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "service role insert alerts" ON public.alerts_log;
CREATE POLICY "service role insert alerts" ON public.alerts_log
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- 2) invoices: RLS is enabled; add minimal policies.
DROP POLICY IF EXISTS invoices_select_own ON public.invoices;
CREATE POLICY invoices_select_own ON public.invoices
  FOR SELECT
  TO authenticated
  USING (customer_user_id = auth.uid());

DROP POLICY IF EXISTS invoices_service_all ON public.invoices;
CREATE POLICY invoices_service_all ON public.invoices
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 3) Add covering indexes for common foreign keys flagged by the performance advisor.
CREATE INDEX IF NOT EXISTS alerts_log_station_id_idx ON public.alerts_log (station_id);
CREATE INDEX IF NOT EXISTS b2b_subscriptions_route_id_idx ON public.b2b_subscriptions (route_id);
CREATE INDEX IF NOT EXISTS inbox_messages_sender_id_idx ON public.inbox_messages (sender_id);
CREATE INDEX IF NOT EXISTS invoices_station_id_idx ON public.invoices (station_id);
CREATE INDEX IF NOT EXISTS invoices_b2b_subscription_id_idx ON public.invoices (b2b_subscription_id);
CREATE INDEX IF NOT EXISTS reward_events_user_id_idx ON public.reward_events (user_id);
CREATE INDEX IF NOT EXISTS station_claims_station_id_idx ON public.station_claims (station_id);
CREATE INDEX IF NOT EXISTS station_claims_reviewer_id_idx ON public.station_claims (reviewer_id);
CREATE INDEX IF NOT EXISTS station_followers_station_id_idx ON public.station_followers (station_id);
CREATE INDEX IF NOT EXISTS station_location_reports_reported_by_user_id_idx ON public.station_location_reports (reported_by_user_id);
CREATE INDEX IF NOT EXISTS station_status_reports_reporter_user_id_idx ON public.station_status_reports (reporter_user_id);
CREATE INDEX IF NOT EXISTS station_suggestions_station_id_idx ON public.station_suggestions (station_id);
CREATE INDEX IF NOT EXISTS station_suggestions_suggested_by_idx ON public.station_suggestions (suggested_by);
