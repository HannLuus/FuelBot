-- B2B payment screenshot: column + storage bucket for upload-and-review flow

-- 1. Add optional screenshot path to b2b_subscriptions
ALTER TABLE public.b2b_subscriptions
  ADD COLUMN IF NOT EXISTS screenshot_path text;

-- 2. Create storage bucket for B2B payment screenshots (admin/bot can review)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'b2b-payment-screenshots',
  'b2b-payment-screenshots',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 3. RLS policies: authenticated users can upload to their own folder; service role can read all
DROP POLICY IF EXISTS "Users can upload own B2B payment screenshots" ON storage.objects;
CREATE POLICY "Users can upload own B2B payment screenshots"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'b2b-payment-screenshots'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can read own B2B payment screenshots" ON storage.objects;
CREATE POLICY "Users can read own B2B payment screenshots"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'b2b-payment-screenshots'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow service role (admin/bot) to read all in bucket - default service role bypasses RLS, so no policy needed for that.
-- Public read not allowed; links require signed URLs or service role.
