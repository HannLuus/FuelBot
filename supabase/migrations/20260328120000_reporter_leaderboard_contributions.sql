-- Leaderboard: score includes fuel reports + admin-approved station suggestions + admin-approved owner registrations.
-- Display: optional reporter_display_names; else initials from auth metadata/email with numeric suffix for collisions.

ALTER TABLE public.station_suggestions
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

ALTER TABLE public.stations
  ADD COLUMN IF NOT EXISTS owner_verified_at timestamptz;

COMMENT ON COLUMN public.station_suggestions.approved_at IS 'When admin approved the suggestion (station created/linked). Used for reporter leaderboard time window.';
COMMENT ON COLUMN public.stations.owner_verified_at IS 'When owner registration was admin-approved (is_verified). Used for reporter leaderboard time window.';

UPDATE public.station_suggestions
SET approved_at = created_at
WHERE status = 'approved' AND approved_at IS NULL;

UPDATE public.stations
SET owner_verified_at = COALESCE(updated_at, created_at)
WHERE is_verified = true
  AND verification_source = 'owner'
  AND verified_owner_id IS NOT NULL
  AND owner_verified_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_station_suggestions_approved_leaderboard
  ON public.station_suggestions (suggested_by, approved_at)
  WHERE status = 'approved' AND suggested_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stations_owner_verified_leaderboard
  ON public.stations (verified_owner_id, owner_verified_at)
  WHERE is_verified = true AND verification_source = 'owner' AND verified_owner_id IS NOT NULL;

-- Candidate display string: OAuth full_name / name, else email local part
CREATE OR REPLACE FUNCTION public.reporter_candidate_name_from_auth(meta jsonb, email text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(btrim(COALESCE(meta->>'full_name', meta->>'name')), ''),
    NULLIF(btrim(split_part(COALESCE(email, ''), '@', 1)), '')
  );
$$;

-- Up to three whitespace-separated tokens → first grapheme each (UTF-8 safe via left())
CREATE OR REPLACE FUNCTION public.reporter_initials_from_full_name(p_full_name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  normalized text;
  parts text[];
  i int;
  w text;
  result text := '';
  n int;
BEGIN
  IF p_full_name IS NULL OR btrim(p_full_name) = '' THEN
    RETURN '';
  END IF;
  normalized := btrim(regexp_replace(p_full_name, '[[:space:]]+', ' ', 'g'));
  parts := string_to_array(normalized, ' ');
  n := COALESCE(array_length(parts, 1), 0);
  IF n = 0 THEN
    RETURN '';
  END IF;
  FOR i IN 1..LEAST(n, 3) LOOP
    w := parts[i];
    IF w IS NOT NULL AND w <> '' THEN
      result := result || upper(left(w, 1));
    END IF;
  END LOOP;
  RETURN result;
END;
$$;

DROP FUNCTION IF EXISTS public.get_top_reporters(integer, integer);
CREATE OR REPLACE FUNCTION public.get_top_reporters(
  period_days integer DEFAULT 30,
  result_limit integer DEFAULT 20
)
RETURNS TABLE (
  user_id uuid,
  display_name text,
  report_count bigint,
  rank bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH bounds AS (
    SELECT (now() - (period_days || ' days')::interval) AS t0
  ),
  raw_points AS (
    SELECT r.reporter_user_id AS uid
    FROM public.station_status_reports r
    CROSS JOIN bounds b
    WHERE r.reporter_user_id IS NOT NULL
      AND r.reporter_role <> 'VERIFIED_STATION'
      AND r.reported_at >= b.t0
    UNION ALL
    SELECT s.suggested_by AS uid
    FROM public.station_suggestions s
    CROSS JOIN bounds b
    WHERE s.status = 'approved'
      AND s.suggested_by IS NOT NULL
      AND s.approved_at IS NOT NULL
      AND s.approved_at >= b.t0
    UNION ALL
    SELECT st.verified_owner_id AS uid
    FROM public.stations st
    CROSS JOIN bounds b
    WHERE st.is_verified = true
      AND st.verification_source = 'owner'
      AND st.verified_owner_id IS NOT NULL
      AND st.owner_verified_at IS NOT NULL
      AND st.owner_verified_at >= b.t0
  ),
  aggregated AS (
    SELECT p.uid AS user_id, COUNT(*)::bigint AS report_count
    FROM raw_points p
    WHERE p.uid IS NOT NULL
    GROUP BY p.uid
  ),
  ranked AS (
    SELECT
      a.user_id,
      a.report_count,
      ROW_NUMBER() OVER (ORDER BY a.report_count DESC, a.user_id ASC) AS rank
    FROM aggregated a
  ),
  topn AS (
    SELECT r.user_id, r.report_count, r.rank
    FROM ranked r
    WHERE r.rank <= result_limit
  ),
  labeled AS (
    SELECT
      t.user_id,
      t.report_count,
      t.rank,
      d.display_name AS custom_display,
      u.raw_user_meta_data AS meta,
      u.email AS email
    FROM topn t
    LEFT JOIN public.reporter_display_names d ON d.user_id = t.user_id
    LEFT JOIN auth.users u ON u.id = t.user_id
  ),
  initials_computed AS (
    SELECT
      l.*,
      public.reporter_initials_from_full_name(
        public.reporter_candidate_name_from_auth(l.meta, l.email)
      ) AS initials_raw
    FROM labeled l
  ),
  with_keys AS (
    SELECT
      c.*,
      CASE
        WHEN c.custom_display IS NOT NULL AND btrim(c.custom_display) <> '' THEN NULL::text
        ELSE COALESCE(NULLIF(btrim(c.initials_raw), ''), '?')
      END AS initials_key
    FROM initials_computed c
  ),
  disambiguated AS (
    SELECT
      w.*,
      ROW_NUMBER() OVER (
        PARTITION BY
          CASE
            WHEN w.custom_display IS NOT NULL AND btrim(w.custom_display) <> '' THEN w.user_id::text
            ELSE COALESCE(w.initials_key, '')
          END
        ORDER BY w.rank, w.user_id
      ) AS initial_dup_rn
    FROM with_keys w
  )
  SELECT
    d.user_id,
    CASE
      WHEN d.custom_display IS NOT NULL AND btrim(d.custom_display) <> '' THEN btrim(d.custom_display)
      ELSE d.initials_key || CASE WHEN d.initial_dup_rn <= 1 THEN '' ELSE d.initial_dup_rn::text END
    END AS display_name,
    d.report_count,
    d.rank
  FROM disambiguated d
  ORDER BY d.rank;
$$;

DROP FUNCTION IF EXISTS public.get_my_reporter_stats(integer);
CREATE OR REPLACE FUNCTION public.get_my_reporter_stats(
  period_days integer DEFAULT 30
)
RETURNS TABLE (
  report_count bigint,
  rank bigint,
  total_reporters bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH bounds AS (
    SELECT (now() - (period_days || ' days')::interval) AS t0
  ),
  raw_points AS (
    SELECT r.reporter_user_id AS uid
    FROM public.station_status_reports r
    CROSS JOIN bounds b
    WHERE r.reporter_user_id IS NOT NULL
      AND r.reporter_role <> 'VERIFIED_STATION'
      AND r.reported_at >= b.t0
    UNION ALL
    SELECT s.suggested_by AS uid
    FROM public.station_suggestions s
    CROSS JOIN bounds b
    WHERE s.status = 'approved'
      AND s.suggested_by IS NOT NULL
      AND s.approved_at IS NOT NULL
      AND s.approved_at >= b.t0
    UNION ALL
    SELECT st.verified_owner_id AS uid
    FROM public.stations st
    CROSS JOIN bounds b
    WHERE st.is_verified = true
      AND st.verification_source = 'owner'
      AND st.verified_owner_id IS NOT NULL
      AND st.owner_verified_at IS NOT NULL
      AND st.owner_verified_at >= b.t0
  ),
  aggregated AS (
    SELECT p.uid AS user_id, COUNT(*)::bigint AS report_count
    FROM raw_points p
    WHERE p.uid IS NOT NULL
    GROUP BY p.uid
  ),
  ranked AS (
    SELECT
      a.user_id,
      a.report_count,
      ROW_NUMBER() OVER (ORDER BY a.report_count DESC, a.user_id ASC) AS rank
    FROM aggregated a
  )
  SELECT
    COALESCE((SELECT r.report_count FROM ranked r WHERE r.user_id = auth.uid()), 0)::bigint AS report_count,
    COALESCE((SELECT r.rank FROM ranked r WHERE r.user_id = auth.uid()), 0)::bigint AS rank,
    (SELECT COUNT(*)::bigint FROM ranked) AS total_reporters;
$$;

GRANT EXECUTE ON FUNCTION public.get_top_reporters(integer, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_reporter_stats(integer) TO anon, authenticated, service_role;
