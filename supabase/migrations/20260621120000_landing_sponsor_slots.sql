-- Landing page sponsor billboard slots (max 10 static images in hero carousel).

CREATE TABLE IF NOT EXISTS public.landing_sponsor_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_number int NOT NULL UNIQUE CHECK (slot_number BETWEEN 1 AND 10),
  company_name text,
  image_path text,
  link_url text,
  caption_en text,
  caption_my text,
  is_active boolean NOT NULL DEFAULT false,
  starts_at timestamptz,
  ends_at timestamptz,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_landing_sponsor_slots_active
  ON public.landing_sponsor_slots (is_active, sort_order)
  WHERE is_active = true;

ALTER TABLE public.landing_sponsor_slots ENABLE ROW LEVEL SECURITY;

-- Public read: active slots within date range with an image
CREATE POLICY "landing_sponsor_slots_public_select"
  ON public.landing_sponsor_slots
  FOR SELECT
  TO anon, authenticated
  USING (
    is_active = true
    AND image_path IS NOT NULL
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at IS NULL OR ends_at > now())
  );

CREATE POLICY "landing_sponsor_slots_admin_insert"
  ON public.landing_sponsor_slots
  FOR INSERT
  TO authenticated
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "landing_sponsor_slots_admin_update"
  ON public.landing_sponsor_slots
  FOR UPDATE
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "landing_sponsor_slots_admin_delete"
  ON public.landing_sponsor_slots
  FOR DELETE
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Admin needs to read all rows (including inactive) for management UI
CREATE POLICY "landing_sponsor_slots_admin_select"
  ON public.landing_sponsor_slots
  FOR SELECT
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Seed empty slots 1–10 so admin always has a row per slot
INSERT INTO public.landing_sponsor_slots (slot_number, sort_order)
SELECT n, n
FROM generate_series(1, 10) AS n
ON CONFLICT (slot_number) DO NOTHING;

-- Public bucket for sponsor billboard images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'landing-sponsors',
  'landing-sponsors',
  true,
  524288,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "landing_sponsors_public_select" ON storage.objects;
CREATE POLICY "landing_sponsors_public_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'landing-sponsors');

DROP POLICY IF EXISTS "landing_sponsors_admin_insert" ON storage.objects;
CREATE POLICY "landing_sponsors_admin_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'landing-sponsors'
    AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

DROP POLICY IF EXISTS "landing_sponsors_admin_update" ON storage.objects;
CREATE POLICY "landing_sponsors_admin_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'landing-sponsors'
    AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  )
  WITH CHECK (
    bucket_id = 'landing-sponsors'
    AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

DROP POLICY IF EXISTS "landing_sponsors_admin_delete" ON storage.objects;
CREATE POLICY "landing_sponsors_admin_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'landing-sponsors'
    AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );
