-- Hard remove reporter rewards + referral program (UI and active writes).
-- Keeps referral_rewards / referral_codes rows for audit; drops gamification tables/RPCs.

-- ── Reporter rewards: drop RPCs ───────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.get_top_reporters(integer, integer);
DROP FUNCTION IF EXISTS public.get_my_reporter_stats(integer);
DROP FUNCTION IF EXISTS public.reporter_candidate_name_from_auth(jsonb, text);
DROP FUNCTION IF EXISTS public.reporter_initials_from_full_name(text);

-- ── Reporter rewards: drop tables ─────────────────────────────────────────────

DROP TABLE IF EXISTS public.reward_events;
DROP TABLE IF EXISTS public.reporter_display_names;

-- Leaderboard-only indexes (columns approved_at / owner_verified_at stay for admin)
DROP INDEX IF EXISTS public.idx_station_suggestions_approved_leaderboard;
DROP INDEX IF EXISTS public.idx_stations_owner_verified_leaderboard;

-- ── Referral program: stop authenticated writes (audit tables remain) ───────

REVOKE INSERT, UPDATE, DELETE ON TABLE public.referral_rewards FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.referral_codes FROM authenticated;

-- Service role retains access for edge functions / admin export; app no longer writes.
