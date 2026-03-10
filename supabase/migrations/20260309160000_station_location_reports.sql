-- Allow users to report wrong or bad station locations so admins can fix or deactivate.
CREATE TABLE IF NOT EXISTS public.station_location_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id uuid NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
  reported_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_station_location_reports_station_id
  ON public.station_location_reports(station_id);
CREATE INDEX IF NOT EXISTS idx_station_location_reports_created_at
  ON public.station_location_reports(created_at DESC);

ALTER TABLE public.station_location_reports ENABLE ROW LEVEL SECURITY;

-- Anyone (including anon) can insert a report so we can collect feedback without login.
CREATE POLICY station_location_reports_insert ON public.station_location_reports
  FOR INSERT WITH CHECK (true);

-- Only service role can read (admin reviews reports).
CREATE POLICY station_location_reports_select_service ON public.station_location_reports
  FOR SELECT USING (auth.jwt() ->> 'role' = 'service_role');

COMMENT ON TABLE public.station_location_reports IS 'User reports of wrong or inaccurate station locations for admin review.';
