-- Add station_current_status to Realtime publication so the app can subscribe to
-- postgres_changes and get live updates when status changes.
ALTER PUBLICATION supabase_realtime ADD TABLE station_current_status;
