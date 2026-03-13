-- Users (signed-in or anon via service role) can suggest a filling station that is
-- not yet in the system. Admin reviews, optionally looks up on Google Maps, then
-- approves (creates a stations row) or rejects.

CREATE TABLE IF NOT EXISTS public.station_suggestions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  address       text,
  city          text,
  lat           double precision,
  lng           double precision,
  note          text,
  suggested_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'approved', 'rejected')),
  station_id    uuid REFERENCES public.stations(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.station_suggestions ENABLE ROW LEVEL SECURITY;

-- Anyone can insert (anon or authenticated)
DROP POLICY IF EXISTS station_suggestions_insert ON public.station_suggestions;
CREATE POLICY station_suggestions_insert ON public.station_suggestions
  FOR INSERT WITH CHECK (true);

-- Only the suggester can read their own rows
DROP POLICY IF EXISTS station_suggestions_select_own ON public.station_suggestions;
CREATE POLICY station_suggestions_select_own ON public.station_suggestions
  FOR SELECT USING (suggested_by = auth.uid());

-- Admin can read and update all rows
DROP POLICY IF EXISTS station_suggestions_admin ON public.station_suggestions;
CREATE POLICY station_suggestions_admin ON public.station_suggestions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid()
        AND (raw_app_meta_data->>'role') = 'admin'
    )
  );

CREATE INDEX IF NOT EXISTS idx_station_suggestions_status
  ON public.station_suggestions(status);
