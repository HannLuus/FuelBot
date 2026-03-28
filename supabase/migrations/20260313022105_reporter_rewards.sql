-- Reporter rewards system
-- Adds: reporter_display_names, reward_events, get_top_reporters RPC

-- Optional display name that reporters can set for the leaderboard
CREATE TABLE IF NOT EXISTS public.reporter_display_names (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 30),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reporter_display_names ENABLE ROW LEVEL SECURITY;

-- Users can manage their own display name
DROP POLICY IF EXISTS "reporter_display_names_own" ON public.reporter_display_names;
CREATE POLICY "reporter_display_names_own"
  ON public.reporter_display_names
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Public can read display names (they appear on the leaderboard)
DROP POLICY IF EXISTS "reporter_display_names_public_read" ON public.reporter_display_names;
CREATE POLICY "reporter_display_names_public_read"
  ON public.reporter_display_names
  FOR SELECT
  USING (true);

-- Audit table for monthly reward winners
CREATE TABLE IF NOT EXISTS public.reward_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_label text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reward_type text NOT NULL CHECK (reward_type IN ('TOP_PERFORMER', 'LUCKY_DRAW')),
  report_count integer,
  rank integer,
  reward_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reward_events ENABLE ROW LEVEL SECURITY;

-- Admin RLS policy added in 20260313100001_reward_events_admin_policy.sql


-- RPC: return ranked reporters for a given rolling period
DROP FUNCTION IF EXISTS public.get_top_reporters(integer, integer);
CREATE OR REPLACE FUNCTION get_top_reporters(
  period_days integer DEFAULT 30,
  result_limit integer DEFAULT 20
)
RETURNS TABLE (
  user_id uuid,
  display_name text,
  report_count bigint,
  rank bigint
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.reporter_user_id AS user_id,
    COALESCE(d.display_name, NULL) AS display_name,
    COUNT(*) AS report_count,
    ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC) AS rank
  FROM station_status_reports r
  LEFT JOIN public.reporter_display_names d ON d.user_id = r.reporter_user_id
  WHERE
    r.reporter_user_id IS NOT NULL
    AND r.reporter_role != 'VERIFIED_STATION'
    AND r.reported_at >= now() - (period_days || ' days')::interval
  GROUP BY r.reporter_user_id, d.display_name
  ORDER BY report_count DESC
  LIMIT result_limit;
$$;

-- RPC: single-user stats for in-app "Your stats" card
DROP FUNCTION IF EXISTS public.get_my_reporter_stats(integer);
CREATE OR REPLACE FUNCTION get_my_reporter_stats(
  period_days integer DEFAULT 30
)
RETURNS TABLE (
  report_count bigint,
  rank bigint,
  total_reporters bigint
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH ranked AS (
    SELECT
      r.reporter_user_id,
      COUNT(*) AS report_count,
      ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC) AS rank
    FROM station_status_reports r
    WHERE
      r.reporter_user_id IS NOT NULL
      AND r.reporter_role != 'VERIFIED_STATION'
      AND r.reported_at >= now() - (period_days || ' days')::interval
    GROUP BY r.reporter_user_id
  )
  SELECT
    COALESCE((SELECT report_count FROM ranked WHERE reporter_user_id = auth.uid()), 0) AS report_count,
    COALESCE((SELECT rank FROM ranked WHERE reporter_user_id = auth.uid()), 0) AS rank,
    COUNT(*) AS total_reporters
  FROM ranked;
$$;
