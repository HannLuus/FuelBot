-- Allow admin users (app_metadata.role = 'admin') to read and write reward_events
-- This enables the Admin panel to insert monthly winner records and display history.
CREATE POLICY "reward_events_admin"
  ON reward_events
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
