-- Enforce signed-in-only station suggestions so referral attribution is never anonymous.
-- Existing legacy rows with suggested_by IS NULL are preserved for history/review.

ALTER TABLE public.station_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS station_suggestions_insert ON public.station_suggestions;
CREATE POLICY station_suggestions_insert ON public.station_suggestions
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND suggested_by = auth.uid()
  );
