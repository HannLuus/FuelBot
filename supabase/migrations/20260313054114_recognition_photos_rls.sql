-- RLS policies for recognition-photos storage bucket.
-- Path convention: {user_id}/{station_id}/recognition-{timestamp}.{ext}
-- The bucket is public (read-only for all), but writes are scoped to the owner's folder.

DROP POLICY IF EXISTS "Users can upload own recognition photos" ON storage.objects;
CREATE POLICY "Users can upload own recognition photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'recognition-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can update own recognition photos" ON storage.objects;
CREATE POLICY "Users can update own recognition photos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'recognition-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can delete own recognition photos" ON storage.objects;
CREATE POLICY "Users can delete own recognition photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'recognition-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
