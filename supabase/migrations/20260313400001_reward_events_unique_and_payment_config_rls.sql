-- OPT-2: Prevent double-recording the same reward draw for the same period.
-- The admin UI allows re-running a lucky draw and clicking "Record Winners" multiple times.
-- Without this constraint a careless click creates duplicate reward entries for the same month.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reward_events_period_type_user_unique'
      AND conrelid = 'public.reward_events'::regclass
  ) THEN
    ALTER TABLE public.reward_events
      ADD CONSTRAINT reward_events_period_type_user_unique
      UNIQUE (period_label, reward_type, user_id);
  END IF;
END;
$$;


-- OPT-7: Replace payment_config write policies that used an admin_users subquery
-- with the JWT app_metadata check used everywhere else in the schema.
-- The subquery adds a round-trip per evaluation; the JWT check is in-memory.

DROP POLICY IF EXISTS "payment_config_update_admin" ON public.payment_config;
CREATE POLICY "payment_config_update_admin"
  ON public.payment_config FOR UPDATE
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "payment_config_insert_admin" ON public.payment_config;
CREATE POLICY "payment_config_insert_admin"
  ON public.payment_config FOR INSERT
  TO authenticated
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
