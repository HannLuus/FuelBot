-- BLOCKER-5: Admin write policy on stations table.
-- Without this, approveClaim() in AdminPage.tsx (which uses the anon client + admin JWT)
-- silently returns 0 rows updated because no RLS policy allows authenticated admin writes.
-- All other admin write operations on stations go through service-role Edge Functions;
-- this policy covers the one direct-client path (claim approval).

DROP POLICY IF EXISTS "admin all stations" ON public.stations;
CREATE POLICY "admin all stations" ON public.stations
  FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');


-- BLOCKER-6: Storage RLS for station-verification and b2b-payment-screenshots buckets.
-- Without per-folder policies these buckets are either fully public or inaccessible,
-- both of which are wrong. Each user may only read/write within their own user_id/ folder.

-- station-verification: operators upload station + location photos here during registration
CREATE POLICY "station_verification_owner_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'station-verification' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "station_verification_owner_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'station-verification' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "station_verification_owner_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'station-verification' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "station_verification_owner_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'station-verification' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- b2b-payment-screenshots: fleet customers upload payment proof here
CREATE POLICY "b2b_payment_owner_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'b2b-payment-screenshots' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "b2b_payment_owner_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'b2b-payment-screenshots' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "b2b_payment_owner_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'b2b-payment-screenshots' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "b2b_payment_owner_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'b2b-payment-screenshots' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );
