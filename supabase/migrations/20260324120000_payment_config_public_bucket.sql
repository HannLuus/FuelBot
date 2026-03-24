-- Public bucket for admin-uploaded payment QR image (Operator + B2B pages read via URL).
-- Only JWT admins (app_metadata.role = 'admin') may write; anyone may read (public URLs).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'payment-config',
  'payment-config',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "payment_config_public_select" ON storage.objects;
CREATE POLICY "payment_config_public_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'payment-config');

DROP POLICY IF EXISTS "payment_config_admin_insert" ON storage.objects;
CREATE POLICY "payment_config_admin_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'payment-config'
    AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

DROP POLICY IF EXISTS "payment_config_admin_update" ON storage.objects;
CREATE POLICY "payment_config_admin_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'payment-config'
    AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  )
  WITH CHECK (
    bucket_id = 'payment-config'
    AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

DROP POLICY IF EXISTS "payment_config_admin_delete" ON storage.objects;
CREATE POLICY "payment_config_admin_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'payment-config'
    AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );
