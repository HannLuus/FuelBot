-- Add station_current_status to Realtime publication so the app can subscribe to
-- postgres_changes and get live updates when status changes.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'station_current_status'
      AND c.relkind = 'r'
  ) THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.station_current_status;
    EXCEPTION
      WHEN duplicate_object THEN
        NULL;
    END;
  END IF;
END $$;
