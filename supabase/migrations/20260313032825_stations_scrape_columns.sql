-- Add columns from SCRAPE1.csv for marketing and contact (high value + name_for_emails).
-- phone, website, working_hours, owner_title (high value); name_for_emails (medium).
ALTER TABLE public.stations
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS working_hours jsonb,
  ADD COLUMN IF NOT EXISTS owner_title text,
  ADD COLUMN IF NOT EXISTS name_for_emails text;

COMMENT ON COLUMN public.stations.phone IS 'Contact phone from trusted source (e.g. scraper).';
COMMENT ON COLUMN public.stations.website IS 'Station or brand website.';
COMMENT ON COLUMN public.stations.working_hours IS 'Opening hours as JSON, e.g. {"Monday": ["4AM-9PM"], ...}.';
COMMENT ON COLUMN public.stations.owner_title IS 'Business/chain name from source (e.g. DENKO, Max Energy).';
COMMENT ON COLUMN public.stations.name_for_emails IS 'ASCII-friendly name for emails and exports.';
