-- Add ip_hash column to station_status_reports for server-side IP rate limiting.
-- Stores an HMAC-derived hash of the reporter's IP address (never the raw IP).
-- NULL for authenticated reporters — only populated for anonymous (ANON role) reports.

ALTER TABLE public.station_status_reports
  ADD COLUMN IF NOT EXISTS ip_hash text;

-- Index to make the per-station/per-ip-hash/per-hour count query efficient
CREATE INDEX IF NOT EXISTS idx_station_status_reports_ip_hash
  ON public.station_status_reports (station_id, ip_hash, reported_at)
  WHERE ip_hash IS NOT NULL;
