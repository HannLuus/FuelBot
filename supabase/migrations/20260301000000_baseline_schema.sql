--
-- PostgreSQL database dump
--

-- \restrict uWG9gg0cXA0S1ckDJH5VKXmAQNQPZKikneFh7m6iAhuBxyIyszkg3ycN8J5FsrB

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
-- SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: pg_database_owner
--

CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";

CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "public";

CREATE EXTENSION IF NOT EXISTS "postgis" WITH SCHEMA "public";

--
-- Name: SCHEMA "public"; Type: COMMENT; Schema: -; Owner: pg_database_owner
--

COMMENT ON SCHEMA "public" IS 'standard public schema';


--
-- Name: alert_channel; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."alert_channel" AS ENUM (
    'PUSH',
    'EMAIL'
);


ALTER TYPE "public"."alert_channel" OWNER TO "postgres";

--
-- Name: alert_trigger; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."alert_trigger" AS ENUM (
    'FUEL_BACK_IN_STOCK'
);


ALTER TYPE "public"."alert_trigger" OWNER TO "postgres";

--
-- Name: claim_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."claim_status" AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED'
);


ALTER TYPE "public"."claim_status" OWNER TO "postgres";

--
-- Name: fuel_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."fuel_status" AS ENUM (
    'AVAILABLE',
    'LIMITED',
    'OUT',
    'UNKNOWN'
);


ALTER TYPE "public"."fuel_status" OWNER TO "postgres";

--
-- Name: queue_bucket; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."queue_bucket" AS ENUM (
    'NONE',
    'MIN_0_15',
    'MIN_15_30',
    'MIN_30_60',
    'MIN_60_PLUS'
);


ALTER TYPE "public"."queue_bucket" OWNER TO "postgres";

--
-- Name: reporter_role; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."reporter_role" AS ENUM (
    'VERIFIED_STATION',
    'TRUSTED',
    'CROWD',
    'ANON'
);


ALTER TYPE "public"."reporter_role" OWNER TO "postgres";

--
-- Name: subscription_tier; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."subscription_tier" AS ENUM (
    'BASIC',
    'VERIFIED',
    'FLEET'
);


ALTER TYPE "public"."subscription_tier" OWNER TO "postgres";

--
-- Name: vote_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."vote_type" AS ENUM (
    'CONFIRM',
    'DISAGREE'
);


ALTER TYPE "public"."vote_type" OWNER TO "postgres";

--
-- Name: allocate_invoice_number(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."allocate_invoice_number"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  n bigint;
  y text;
BEGIN
  y := to_char((now() AT TIME ZONE 'utc'), 'YYYY');
  n := nextval('public.invoice_number_seq');
  RETURN 'FB-' || y || '-' || lpad(n::text, 6, '0');
END;
$$;


ALTER FUNCTION "public"."allocate_invoice_number"() OWNER TO "postgres";

--
-- Name: compute_station_status("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."compute_station_status"("p_station_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  best_report station_status_reports;
  confirm_count int;
  disagree_count int;
  vote_bonus numeric;
  final_confidence numeric;
  age_seconds numeric;
  decay_secs int;
  freshness_factor numeric;
  is_stale_val boolean;
BEGIN
  SELECT r.* INTO best_report
  FROM station_status_reports r
  WHERE r.station_id = p_station_id
    AND r.is_flagged = false
    AND r.expires_at > now()
  ORDER BY role_base_weight(r.reporter_role) DESC, r.reported_at DESC
  LIMIT 1;

  IF best_report IS NULL THEN
    INSERT INTO station_current_status (station_id, fuel_statuses_computed, queue_bucket_computed, confidence_score, source_role, last_updated_at, is_stale)
    VALUES (p_station_id, '{}', NULL, 0, NULL, NULL, true)
    ON CONFLICT (station_id) DO UPDATE SET
      fuel_statuses_computed = '{}', queue_bucket_computed = NULL,
      confidence_score = 0, source_role = NULL, last_updated_at = NULL, is_stale = true;
    RETURN;
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE vote = 'CONFIRM'),
    COUNT(*) FILTER (WHERE vote = 'DISAGREE')
  INTO confirm_count, disagree_count
  FROM status_votes WHERE report_id = best_report.id;

  vote_bonus := LEAST(0.3, (confirm_count * 0.05) - (disagree_count * 0.07));
  decay_secs := role_decay_seconds(best_report.reporter_role);
  age_seconds := EXTRACT(EPOCH FROM (now() - best_report.reported_at));
  freshness_factor := GREATEST(0, 1.0 - (age_seconds / decay_secs));
  is_stale_val := age_seconds > decay_secs;
  final_confidence := LEAST(1.0, GREATEST(0, role_base_weight(best_report.reporter_role) * freshness_factor + vote_bonus));

  INSERT INTO station_current_status (station_id, fuel_statuses_computed, queue_bucket_computed, confidence_score, source_role, last_updated_at, is_stale)
  VALUES (p_station_id, best_report.fuel_statuses, best_report.queue_bucket, ROUND(final_confidence, 3), best_report.reporter_role, best_report.reported_at, is_stale_val)
  ON CONFLICT (station_id) DO UPDATE SET
    fuel_statuses_computed = EXCLUDED.fuel_statuses_computed,
    queue_bucket_computed = EXCLUDED.queue_bucket_computed,
    confidence_score = EXCLUDED.confidence_score,
    source_role = EXCLUDED.source_role,
    last_updated_at = EXCLUDED.last_updated_at,
    is_stale = EXCLUDED.is_stale;
END;
$$;


ALTER FUNCTION "public"."compute_station_status"("p_station_id" "uuid") OWNER TO "postgres";

--
-- Name: ensure_user_legal_acceptance(timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."ensure_user_legal_acceptance"("p_terms_accepted_at" timestamp with time zone DEFAULT "now"(), "p_privacy_accepted_at" timestamp with time zone DEFAULT "now"()) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.user_legal_acceptances (user_id, terms_accepted_at, privacy_accepted_at)
  VALUES (auth.uid(), p_terms_accepted_at, p_privacy_accepted_at)
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;


ALTER FUNCTION "public"."ensure_user_legal_acceptance"("p_terms_accepted_at" timestamp with time zone, "p_privacy_accepted_at" timestamp with time zone) OWNER TO "postgres";

--
-- Name: FUNCTION "ensure_user_legal_acceptance"("p_terms_accepted_at" timestamp with time zone, "p_privacy_accepted_at" timestamp with time zone); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."ensure_user_legal_acceptance"("p_terms_accepted_at" timestamp with time zone, "p_privacy_accepted_at" timestamp with time zone) IS 'Records terms/privacy acceptance for the current user; no-op if row already exists.';


--
-- Name: get_all_stations_national(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."get_all_stations_national"() RETURNS SETOF "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM b2b_subscriptions
    WHERE user_id = auth.uid()
      AND plan_type = 'national_view'
      AND valid_until > now()
      AND status = 'CONFIRMED'
  ) THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT (
    to_jsonb(s)::jsonb || jsonb_build_object(
      'current_status',
      (SELECT to_jsonb(scs) FROM station_current_status scs WHERE scs.station_id = s.id)
    )
  )
  FROM stations s
  WHERE s.is_active = true
    AND s.country_code = 'MM'
    AND (s.verification_source IS NOT NULL OR s.is_verified = true OR s.created_at > now() - interval '3 months');
END;
$$;


ALTER FUNCTION "public"."get_all_stations_national"() OWNER TO "postgres";

--
-- Name: get_my_b2b_entitlements(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."get_my_b2b_entitlements"() RETURNS TABLE("plan_type" "text", "route_id" "uuid", "route_name" "text", "valid_until" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  -- 1. Specific route subscriptions
  SELECT s.plan_type, s.route_id, r.name AS route_name, s.valid_until
  FROM b2b_subscriptions s
  INNER JOIN routes r ON r.id = s.route_id AND r.is_active = true
  WHERE s.user_id = auth.uid()
    AND s.plan_type = 'route_view'
    AND s.route_id IS NOT NULL
    AND s.valid_until > now()
    AND s.status = 'CONFIRMED'

  UNION

  -- 2. All active routes for users with an "all routes" subscription (route_id IS NULL)
  SELECT s.plan_type, r.id AS route_id, r.name AS route_name, s.valid_until
  FROM b2b_subscriptions s
  CROSS JOIN routes r
  WHERE s.user_id = auth.uid()
    AND s.plan_type = 'route_view'
    AND s.route_id IS NULL
    AND s.valid_until > now()
    AND s.status = 'CONFIRMED'
    AND r.is_active = true

  UNION

  -- 2b. The base all-routes subscription row (to ensure valid_until is returned even if no routes exist)
  SELECT s.plan_type, s.route_id, NULL::text AS route_name, s.valid_until
  FROM b2b_subscriptions s
  WHERE s.user_id = auth.uid()
    AND s.plan_type = 'route_view'
    AND s.route_id IS NULL
    AND s.valid_until > now()
    AND s.status = 'CONFIRMED'

  UNION

  -- 3. National view
  SELECT s.plan_type, NULL::uuid AS route_id, NULL::text AS route_name, s.valid_until
  FROM b2b_subscriptions s
  WHERE s.user_id = auth.uid()
    AND s.plan_type = 'national_view'
    AND s.valid_until > now()
    AND s.status = 'CONFIRMED';
$$;


ALTER FUNCTION "public"."get_my_b2b_entitlements"() OWNER TO "postgres";

--
-- Name: get_my_reporter_stats(integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."get_my_reporter_stats"("period_days" integer DEFAULT 30) RETURNS TABLE("report_count" bigint, "rank" bigint, "total_reporters" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
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


ALTER FUNCTION "public"."get_my_reporter_stats"("period_days" integer) OWNER TO "postgres";

--
-- Name: get_nearby_stations(double precision, double precision, double precision); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."get_nearby_stations"("user_lat" double precision, "user_lng" double precision, "radius_km" double precision DEFAULT 5) RETURNS TABLE("id" "uuid", "name" "text", "brand" "text", "lat" double precision, "lng" double precision, "address_text" "text", "township" "text", "city" "text", "country_code" character, "is_verified" boolean, "verified_owner_id" "uuid", "verification_source" "text", "is_active" boolean, "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "distance_m" double precision, "current_status" "jsonb")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT
    s.id, s.name, s.brand, s.lat, s.lng, s.address_text,
    s.township, s.city, s.country_code, s.is_verified,
    s.verified_owner_id, s.verification_source, s.is_active, s.created_at, s.updated_at,
    ST_Distance(s.location, ST_MakePoint(user_lng, user_lat)::geography) AS distance_m,
    CASE WHEN cs.station_id IS NOT NULL THEN
      jsonb_build_object(
        'station_id', cs.station_id,
        'fuel_statuses_computed', cs.fuel_statuses_computed,
        'queue_bucket_computed', cs.queue_bucket_computed,
        'confidence_score', cs.confidence_score,
        'source_role', cs.source_role,
        'last_updated_at', cs.last_updated_at,
        'is_stale', cs.is_stale
      )
    ELSE NULL END AS current_status
  FROM stations s
  LEFT JOIN station_current_status cs ON cs.station_id = s.id
  WHERE
    s.is_active = true
    AND s.location IS NOT NULL
    AND ST_DWithin(s.location, ST_MakePoint(user_lng, user_lat)::geography, radius_km * 1000)
    AND (s.verification_source IS NOT NULL OR s.is_verified = true OR s.created_at > now() - interval '3 months')
  ORDER BY distance_m ASC
  LIMIT 500;
$$;


ALTER FUNCTION "public"."get_nearby_stations"("user_lat" double precision, "user_lng" double precision, "radius_km" double precision) OWNER TO "postgres";

--
-- Name: get_station_reliability("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."get_station_reliability"("p_station_id" "uuid") RETURNS TABLE("reports_last_7d" bigint, "reports_last_30d" bigint, "verified_last_7d" bigint, "verified_last_30d" bigint, "last_updated_at" timestamp with time zone, "city_name" "text", "city_stations_count" bigint, "city_avg_reports_7d" numeric, "city_avg_reports_30d" numeric)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  WITH station_city AS (
    SELECT s.id, s.city
    FROM stations s
    WHERE s.id = p_station_id
  ),
  this_station AS (
    SELECT
      (SELECT count(*) FROM station_status_reports r
       WHERE r.station_id = p_station_id AND r.reported_at >= now() - interval '7 days') AS reports_7d,
      (SELECT count(*) FROM station_status_reports r
       WHERE r.station_id = p_station_id AND r.reported_at >= now() - interval '30 days') AS reports_30d,
      (SELECT count(*) FROM station_status_reports r
       WHERE r.station_id = p_station_id AND r.reported_at >= now() - interval '7 days'
         AND r.reporter_role = 'VERIFIED_STATION') AS verified_7d,
      (SELECT count(*) FROM station_status_reports r
       WHERE r.station_id = p_station_id AND r.reported_at >= now() - interval '30 days'
         AND r.reporter_role = 'VERIFIED_STATION') AS verified_30d,
      (SELECT max(r.reported_at) FROM station_status_reports r WHERE r.station_id = p_station_id) AS last_upd
  ),
  city_peers AS (
    SELECT
      s.city,
      count(*) AS station_count,
      round(avg(stats.reports_7d), 1) AS avg_7d,
      round(avg(stats.reports_30d), 1) AS avg_30d
    FROM stations s
    JOIN station_city sc ON s.city = sc.city AND s.is_active = true
    CROSS JOIN LATERAL (
      SELECT
        (SELECT count(*)::numeric FROM station_status_reports r WHERE r.station_id = s.id AND r.reported_at >= now() - interval '7 days') AS reports_7d,
        (SELECT count(*)::numeric FROM station_status_reports r WHERE r.station_id = s.id AND r.reported_at >= now() - interval '30 days') AS reports_30d
    ) AS stats
    GROUP BY s.city
  )
  SELECT
    t.reports_7d::bigint,
    t.reports_30d::bigint,
    t.verified_7d::bigint,
    t.verified_30d::bigint,
    t.last_upd,
    sc.city,
    cp.station_count,
    cp.avg_7d,
    cp.avg_30d
  FROM station_city sc
  CROSS JOIN this_station t
  LEFT JOIN city_peers cp ON cp.city = sc.city;
$$;


ALTER FUNCTION "public"."get_station_reliability"("p_station_id" "uuid") OWNER TO "postgres";

--
-- Name: get_station_uptime("uuid", integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."get_station_uptime"("p_station_id" "uuid", "p_days" integer DEFAULT 30) RETURNS TABLE("has_sufficient_data" boolean, "samples_count" bigint, "expected_samples" bigint, "uptime_pct" numeric)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  WITH window_start AS (
    SELECT now() - (p_days || ' days')::interval AS start_at
  ),
  expected AS (
    SELECT (p_days * 24)::bigint AS n
  ),
  samples AS (
    SELECT
      count(*)::bigint AS cnt,
      count(*) FILTER (WHERE has_any_fuel = true)::bigint AS with_fuel,
      count(*) FILTER (WHERE has_any_fuel = false AND source_role IN ('VERIFIED_STATION', 'TRUSTED'))::bigint AS no_fuel_trusted
    FROM station_status_snapshots s, window_start w
    WHERE s.station_id = p_station_id
      AND s.snapshot_at >= w.start_at
  ),
  -- Count only hours we trust: has fuel (any source) or no fuel (verified/trusted source). Ignore "out" from crowd/anon.
  trusted_total AS (
    SELECT (s.with_fuel + s.no_fuel_trusted)::bigint AS total
    FROM samples s
  ),
  sufficient AS (
    SELECT (SELECT cnt FROM samples) >= (e.n * 0.5) AS ok
    FROM expected e
  )
  SELECT
    (SELECT ok FROM sufficient),
    (SELECT total FROM trusted_total),
    (SELECT n FROM expected),
    CASE
      WHEN (SELECT ok FROM sufficient) AND (SELECT total FROM trusted_total) > 0
      THEN round(100.0 * (SELECT with_fuel FROM samples) / NULLIF((SELECT total FROM trusted_total), 0), 1)
      ELSE NULL
    END;
$$;


ALTER FUNCTION "public"."get_station_uptime"("p_station_id" "uuid", "p_days" integer) OWNER TO "postgres";

--
-- Name: get_stations_along_route("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."get_stations_along_route"("p_route_id" "uuid") RETURNS SETOF "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_waypoints jsonb;
  v_corridor_km numeric;
  v_min_lat numeric;
  v_max_lat numeric;
  v_min_lng numeric;
  v_max_lng numeric;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM b2b_subscriptions
    WHERE user_id = auth.uid()
      AND plan_type = 'route_view'
      AND (route_id = p_route_id OR route_id IS NULL)
      AND valid_until > now()
      AND status = 'CONFIRMED'
  ) THEN
    RETURN;
  END IF;

  SELECT waypoints, corridor_km INTO v_waypoints, v_corridor_km
  FROM routes WHERE id = p_route_id AND is_active = true;
  IF v_waypoints IS NULL OR jsonb_array_length(v_waypoints) = 0 THEN
    RETURN;
  END IF;

  SELECT
    min((elem->>'lat')::numeric) - v_corridor_km / 111.0,
    max((elem->>'lat')::numeric) + v_corridor_km / 111.0,
    min((elem->>'lng')::numeric) - v_corridor_km / 111.0,
    max((elem->>'lng')::numeric) + v_corridor_km / 111.0
  INTO v_min_lat, v_max_lat, v_min_lng, v_max_lng
  FROM jsonb_array_elements(v_waypoints) AS elem;

  RETURN QUERY
  SELECT (
    to_jsonb(s)::jsonb || jsonb_build_object(
      'current_status',
      (SELECT to_jsonb(scs) FROM station_current_status scs WHERE scs.station_id = s.id)
    )
  )
  FROM stations s
  WHERE s.is_active = true
    AND s.country_code = 'MM'
    AND s.lat BETWEEN v_min_lat AND v_max_lat
    AND s.lng BETWEEN v_min_lng AND v_max_lng
    AND (s.verification_source IS NOT NULL OR s.is_verified = true OR s.created_at > now() - interval '3 months');
END;
$$;


ALTER FUNCTION "public"."get_stations_along_route"("p_route_id" "uuid") OWNER TO "postgres";

--
-- Name: get_top_reporters(integer, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."get_top_reporters"("period_days" integer DEFAULT 30, "result_limit" integer DEFAULT 20) RETURNS TABLE("user_id" "uuid", "display_name" "text", "report_count" bigint, "rank" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    r.reporter_user_id AS user_id,
    COALESCE(d.display_name, NULL) AS display_name,
    COUNT(*) AS report_count,
    ROW_NUMBER() OVER (ORDER BY COUNT(*) DESC) AS rank
  FROM station_status_reports r
  LEFT JOIN reporter_display_names d ON d.user_id = r.reporter_user_id
  WHERE
    r.reporter_user_id IS NOT NULL
    AND r.reporter_role != 'VERIFIED_STATION'
    AND r.reported_at >= now() - (period_days || ' days')::interval
  GROUP BY r.reporter_user_id, d.display_name
  ORDER BY report_count DESC
  LIMIT result_limit;
$$;


ALTER FUNCTION "public"."get_top_reporters"("period_days" integer, "result_limit" integer) OWNER TO "postgres";

--
-- Name: inbox_admin_unread_thread_count(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."inbox_admin_unread_thread_count"() RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT CASE
    WHEN
      (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
      OR EXISTS (SELECT 1 FROM public.admin_users WHERE admin_users.user_id = auth.uid())
    THEN (
      SELECT count(*)::integer
      FROM public.inbox_threads t
      WHERE EXISTS (
        SELECT 1 FROM public.inbox_messages m
        WHERE m.thread_id = t.id
          AND m.is_from_admin = false
          AND m.created_at > t.admin_last_read_at
      )
    )
    ELSE 0
  END;
$$;


ALTER FUNCTION "public"."inbox_admin_unread_thread_count"() OWNER TO "postgres";

--
-- Name: inbox_mark_thread_read("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."inbox_mark_thread_read"("p_thread_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  tuid uuid;
  is_adm boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  SELECT user_id INTO tuid FROM public.inbox_threads WHERE id = p_thread_id;
  IF tuid IS NULL THEN
    RAISE EXCEPTION 'thread not found';
  END IF;
  is_adm :=
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    OR EXISTS (SELECT 1 FROM public.admin_users WHERE admin_users.user_id = auth.uid());
  IF is_adm THEN
    UPDATE public.inbox_threads
    SET admin_last_read_at = now(), updated_at = now()
    WHERE id = p_thread_id;
  ELSIF tuid = auth.uid() THEN
    UPDATE public.inbox_threads
    SET user_last_read_at = now(), updated_at = now()
    WHERE id = p_thread_id;
  ELSE
    RAISE EXCEPTION 'forbidden';
  END IF;
END;
$$;


ALTER FUNCTION "public"."inbox_mark_thread_read"("p_thread_id" "uuid") OWNER TO "postgres";

--
-- Name: inbox_touch_thread_on_message(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."inbox_touch_thread_on_message"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE public.inbox_threads
  SET
    last_message_at = NEW.created_at,
    updated_at = now()
  WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."inbox_touch_thread_on_message"() OWNER TO "postgres";

--
-- Name: inbox_user_unread_thread_count(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."inbox_user_unread_thread_count"() RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT count(*)::integer
  FROM public.inbox_threads t
  WHERE t.user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.inbox_messages m
      WHERE m.thread_id = t.id
        AND m.is_from_admin = true
        AND m.created_at > t.user_last_read_at
    );
$$;


ALTER FUNCTION "public"."inbox_user_unread_thread_count"() OWNER TO "postgres";

--
-- Name: role_base_weight("public"."reporter_role"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."role_base_weight"("role" "public"."reporter_role") RETURNS numeric
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN CASE role
    WHEN 'VERIFIED_STATION' THEN 1.0
    WHEN 'TRUSTED' THEN 0.7
    WHEN 'CROWD' THEN 0.4
    WHEN 'ANON' THEN 0.2
    ELSE 0.1
  END;
END;
$$;


ALTER FUNCTION "public"."role_base_weight"("role" "public"."reporter_role") OWNER TO "postgres";

--
-- Name: role_decay_seconds("public"."reporter_role"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."role_decay_seconds"("role" "public"."reporter_role") RETURNS integer
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN 172800; -- 48 * 3600
END;
$$;


ALTER FUNCTION "public"."role_decay_seconds"("role" "public"."reporter_role") OWNER TO "postgres";

--
-- Name: FUNCTION "role_decay_seconds"("role" "public"."reporter_role"); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."role_decay_seconds"("role" "public"."reporter_role") IS 'Seconds a status report is treated as current for aggregation and UI staleness (48h as of 2026-03).';


--
-- Name: sync_station_location_from_lat_lng(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."sync_station_location_from_lat_lng"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL THEN
    NEW.location := ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326)::geography;
  ELSE
    NEW.location := NULL;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_station_location_from_lat_lng"() OWNER TO "postgres";

--
-- Name: trigger_recompute_on_report(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."trigger_recompute_on_report"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  PERFORM compute_station_status(NEW.station_id);
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trigger_recompute_on_report"() OWNER TO "postgres";

--
-- Name: trigger_recompute_on_vote(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE OR REPLACE FUNCTION "public"."trigger_recompute_on_vote"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_station_id uuid;
BEGIN
  SELECT station_id INTO v_station_id FROM station_status_reports WHERE id = NEW.report_id;
  IF v_station_id IS NOT NULL THEN
    PERFORM compute_station_status(v_station_id);
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trigger_recompute_on_vote"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";

--
-- Name: admin_users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."admin_users" (
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."admin_users" OWNER TO "postgres";

--
-- Name: alerts_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."alerts_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "station_id" "uuid" NOT NULL,
    "trigger" "public"."alert_trigger" NOT NULL,
    "channel" "public"."alert_channel" NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."alerts_log" OWNER TO "postgres";

--
-- Name: b2b_pricing_config; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."b2b_pricing_config" (
    "id" "text" DEFAULT 'default'::"text" NOT NULL,
    "list_price_3m_mmk" bigint DEFAULT 36000 NOT NULL,
    "list_price_6m_mmk" bigint DEFAULT 72000 NOT NULL,
    "list_price_12m_mmk" bigint DEFAULT 144000 NOT NULL,
    "promo_price_3m_mmk" bigint DEFAULT 28800 NOT NULL,
    "promo_price_6m_mmk" bigint DEFAULT 57600 NOT NULL,
    "promo_price_12m_mmk" bigint DEFAULT 115200 NOT NULL,
    "promo_enabled" boolean DEFAULT true NOT NULL,
    "promo_starts_at" timestamp with time zone,
    "promo_ends_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "b2b_pricing_positive_prices" CHECK ((("list_price_3m_mmk" > 0) AND ("list_price_6m_mmk" > 0) AND ("list_price_12m_mmk" > 0) AND ("promo_price_3m_mmk" > 0) AND ("promo_price_6m_mmk" > 0) AND ("promo_price_12m_mmk" > 0))),
    CONSTRAINT "b2b_pricing_promo_not_higher" CHECK ((("promo_price_3m_mmk" <= "list_price_3m_mmk") AND ("promo_price_6m_mmk" <= "list_price_6m_mmk") AND ("promo_price_12m_mmk" <= "list_price_12m_mmk"))),
    CONSTRAINT "b2b_pricing_window_valid" CHECK ((("promo_starts_at" IS NULL) OR ("promo_ends_at" IS NULL) OR ("promo_starts_at" <= "promo_ends_at")))
);


ALTER TABLE "public"."b2b_pricing_config" OWNER TO "postgres";

--
-- Name: b2b_subscriptions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."b2b_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "plan_type" "text" NOT NULL,
    "route_id" "uuid",
    "valid_until" timestamp with time zone NOT NULL,
    "payment_reference" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "payment_method" "text",
    "screenshot_path" "text",
    "status" "text" DEFAULT 'PENDING'::"text" NOT NULL,
    "duration_months" integer DEFAULT 12 NOT NULL,
    "price_list_mmk" bigint,
    "price_promo_mmk" bigint,
    "price_paid_mmk" bigint,
    "promo_applied" boolean DEFAULT false NOT NULL,
    "promo_percent" numeric(6,2),
    CONSTRAINT "b2b_subscriptions_duration_months_check" CHECK (("duration_months" = ANY (ARRAY[3, 6, 12]))),
    CONSTRAINT "b2b_subscriptions_plan_type_check" CHECK (("plan_type" = ANY (ARRAY['national_view'::"text", 'route_view'::"text"]))),
    CONSTRAINT "b2b_subscriptions_status_check" CHECK (("status" = ANY (ARRAY['PENDING'::"text", 'CONFIRMED'::"text", 'REJECTED'::"text"])))
);


ALTER TABLE "public"."b2b_subscriptions" OWNER TO "postgres";

--
-- Name: contact_messages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."contact_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sender_name" "text" NOT NULL,
    "sender_email" "text" NOT NULL,
    "subject" "text" NOT NULL,
    "message_body" "text" NOT NULL,
    "screenshot_path" "text",
    "screenshot_filename" "text",
    "locale" "text",
    "source_page" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."contact_messages" OWNER TO "postgres";

--
-- Name: fuel_types; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."fuel_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "display_name_en" "text" NOT NULL,
    "display_name_my" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."fuel_types" OWNER TO "postgres";

--
-- Name: inbox_messages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."inbox_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "thread_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "is_from_admin" boolean NOT NULL,
    "body" "text" DEFAULT ''::"text" NOT NULL,
    "attachment_path" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "inbox_messages_body_or_attachment" CHECK ((("length"(TRIM(BOTH FROM "body")) > 0) OR ("attachment_path" IS NOT NULL)))
);


ALTER TABLE "public"."inbox_messages" OWNER TO "postgres";

--
-- Name: inbox_threads; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."inbox_threads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "subject" "text" DEFAULT 'Support'::"text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "last_message_at" timestamp with time zone,
    "user_last_read_at" timestamp with time zone DEFAULT '1970-01-01 00:00:00+00'::timestamp with time zone NOT NULL,
    "admin_last_read_at" timestamp with time zone DEFAULT '1970-01-01 00:00:00+00'::timestamp with time zone NOT NULL,
    "bulk_batch_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "inbox_threads_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'closed'::"text"])))
);


ALTER TABLE "public"."inbox_threads" OWNER TO "postgres";

--
-- Name: invoice_number_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE IF NOT EXISTS "public"."invoice_number_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."invoice_number_seq" OWNER TO "postgres";

--
-- Name: invoices; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."invoices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_number" "text" NOT NULL,
    "kind" "text" NOT NULL,
    "customer_user_id" "uuid" NOT NULL,
    "station_id" "uuid",
    "b2b_subscription_id" "uuid",
    "line_description" "text" NOT NULL,
    "subtotal_mmk" bigint NOT NULL,
    "tax_rate_percent" numeric(6,2) NOT NULL,
    "tax_mmk" bigint NOT NULL,
    "total_mmk" bigint NOT NULL,
    "currency" "text" DEFAULT 'MMK'::"text" NOT NULL,
    "payment_method" "text",
    "payment_reference" "text",
    "issued_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "invoices_kind_check" CHECK (("kind" = ANY (ARRAY['station_subscription'::"text", 'b2b_route_access'::"text"])))
);


ALTER TABLE "public"."invoices" OWNER TO "postgres";

--
-- Name: payment_config; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."payment_config" (
    "id" "text" DEFAULT 'default'::"text" NOT NULL,
    "payment_instructions" "text",
    "payment_qr_url" "text",
    "payment_phone_kpay" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."payment_config" OWNER TO "postgres";

--
-- Name: push_subscriptions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."push_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "endpoint" "text" NOT NULL,
    "p256dh" "text" NOT NULL,
    "auth" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."push_subscriptions" OWNER TO "postgres";

--
-- Name: referral_codes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."referral_codes" (
    "user_id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."referral_codes" OWNER TO "postgres";

--
-- Name: referral_rewards; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."referral_rewards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "referrer_user_id" "uuid" NOT NULL,
    "station_id" "uuid" NOT NULL,
    "amount_mmk" numeric(12,2) NOT NULL,
    "status" "text" DEFAULT 'PENDING'::"text" NOT NULL,
    "payment_reference" "text",
    "paid_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "payment_method" "text",
    CONSTRAINT "referral_rewards_amount_mmk_check" CHECK (("amount_mmk" >= (0)::numeric)),
    CONSTRAINT "referral_rewards_status_check" CHECK (("status" = ANY (ARRAY['PENDING'::"text", 'PAID'::"text", 'COLLECTED'::"text"])))
);


ALTER TABLE "public"."referral_rewards" OWNER TO "postgres";

--
-- Name: reporter_display_names; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."reporter_display_names" (
    "user_id" "uuid" NOT NULL,
    "display_name" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "reporter_display_names_display_name_check" CHECK ((("char_length"("display_name") >= 2) AND ("char_length"("display_name") <= 30)))
);


ALTER TABLE "public"."reporter_display_names" OWNER TO "postgres";

--
-- Name: reward_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."reward_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "period_label" "text" NOT NULL,
    "user_id" "uuid",
    "reward_type" "text" NOT NULL,
    "report_count" integer,
    "rank" integer,
    "reward_note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "reward_events_reward_type_check" CHECK (("reward_type" = ANY (ARRAY['TOP_PERFORMER'::"text", 'LUCKY_DRAW'::"text"])))
);


ALTER TABLE "public"."reward_events" OWNER TO "postgres";

--
-- Name: routes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."routes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "name_my" "text",
    "waypoints" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "corridor_km" numeric(5,2) DEFAULT 25 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "routes_corridor_km_check" CHECK ((("corridor_km" >= (5)::numeric) AND ("corridor_km" <= (100)::numeric)))
);


ALTER TABLE "public"."routes" OWNER TO "postgres";

--
-- Name: station_claims; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."station_claims" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "station_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "status" "public"."claim_status" DEFAULT 'PENDING'::"public"."claim_status" NOT NULL,
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reviewed_at" timestamp with time zone,
    "reviewer_id" "uuid",
    "payment_screenshot_path" "text",
    CONSTRAINT "station_claims_pending_requires_screenshot" CHECK ((("status" <> 'PENDING'::"public"."claim_status") OR (("payment_screenshot_path" IS NOT NULL) AND ("btrim"("payment_screenshot_path") <> ''::"text"))))
);


ALTER TABLE "public"."station_claims" OWNER TO "postgres";

--
-- Name: station_current_status; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."station_current_status" (
    "station_id" "uuid" NOT NULL,
    "fuel_statuses_computed" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "queue_bucket_computed" "public"."queue_bucket",
    "confidence_score" numeric(4,3) DEFAULT 0 NOT NULL,
    "source_role" "public"."reporter_role",
    "last_updated_at" timestamp with time zone,
    "is_stale" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."station_current_status" OWNER TO "postgres";

--
-- Name: station_followers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."station_followers" (
    "user_id" "uuid" NOT NULL,
    "station_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."station_followers" OWNER TO "postgres";

--
-- Name: station_location_reports; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."station_location_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "station_id" "uuid" NOT NULL,
    "reported_by_user_id" "uuid",
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "suggested_lat" double precision,
    "suggested_lng" double precision,
    "applied_at" timestamp with time zone
);


ALTER TABLE "public"."station_location_reports" OWNER TO "postgres";

--
-- Name: TABLE "station_location_reports"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."station_location_reports" IS 'User reports of wrong or inaccurate station locations for admin review.';


--
-- Name: COLUMN "station_location_reports"."suggested_lat"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."station_location_reports"."suggested_lat" IS 'Driver-reported correct latitude; used with suggested_lng for 10-report consensus.';


--
-- Name: COLUMN "station_location_reports"."suggested_lng"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."station_location_reports"."suggested_lng" IS 'Driver-reported correct longitude.';


--
-- Name: COLUMN "station_location_reports"."applied_at"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."station_location_reports"."applied_at" IS 'Set when this report was used in a batch that updated the station; prevents reuse.';


--
-- Name: station_status_reports; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."station_status_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "station_id" "uuid" NOT NULL,
    "reporter_user_id" "uuid",
    "reporter_role" "public"."reporter_role" DEFAULT 'ANON'::"public"."reporter_role" NOT NULL,
    "reported_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "fuel_statuses" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "queue_bucket" "public"."queue_bucket" DEFAULT 'NONE'::"public"."queue_bucket" NOT NULL,
    "note" "text",
    "device_hash" "text" NOT NULL,
    "is_flagged" boolean DEFAULT false NOT NULL,
    "ip_hash" "text",
    CONSTRAINT "station_status_reports_note_check" CHECK (("char_length"("note") <= 280))
);


ALTER TABLE "public"."station_status_reports" OWNER TO "postgres";

--
-- Name: station_status_snapshots; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."station_status_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "station_id" "uuid" NOT NULL,
    "snapshot_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "fuel_statuses_computed" "jsonb",
    "has_any_fuel" boolean GENERATED ALWAYS AS ((("fuel_statuses_computed" IS NOT NULL) AND ((("fuel_statuses_computed" ->> 'RON92'::"text") = 'AVAILABLE'::"text") OR (("fuel_statuses_computed" ->> 'RON95'::"text") = 'AVAILABLE'::"text") OR (("fuel_statuses_computed" ->> 'DIESEL'::"text") = 'AVAILABLE'::"text") OR (("fuel_statuses_computed" ->> 'PREMIUM_DIESEL'::"text") = 'AVAILABLE'::"text")))) STORED,
    "source_role" "text"
);


ALTER TABLE "public"."station_status_snapshots" OWNER TO "postgres";

--
-- Name: TABLE "station_status_snapshots"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."station_status_snapshots" IS 'Hourly snapshots of station_current_status for uptime calculation.';


--
-- Name: COLUMN "station_status_snapshots"."source_role"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."station_status_snapshots"."source_role" IS 'Role that drove the computed status: VERIFIED_STATION, TRUSTED, CROWD, ANON. Used so uptime does not count crowd/anon "out" against the station.';


--
-- Name: station_suggestions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."station_suggestions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "address" "text",
    "city" "text",
    "lat" double precision,
    "lng" double precision,
    "note" "text",
    "suggested_by" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "station_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "station_suggestions_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."station_suggestions" OWNER TO "postgres";

--
-- Name: stations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."stations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "brand" "text",
    "lat" double precision,
    "lng" double precision,
    "location" "public"."geography"(Point,4326) GENERATED ALWAYS AS (("public"."st_setsrid"("public"."st_makepoint"("lng", "lat"), 4326))::"public"."geography") STORED,
    "address_text" "text",
    "township" "text" DEFAULT ''::"text" NOT NULL,
    "city" "text" DEFAULT ''::"text" NOT NULL,
    "country_code" character(2) DEFAULT 'MM'::"bpchar" NOT NULL,
    "is_verified" boolean DEFAULT false NOT NULL,
    "verified_owner_id" "uuid",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "subscription_tier_requested" "text",
    "payment_received_at" timestamp with time zone,
    "payment_method" "text",
    "payment_reference" "text",
    "payment_confirmed_by" "uuid",
    "referrer_user_id" "uuid",
    "station_photo_urls" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "location_photo_url" "text",
    "referral_paid_at" timestamp with time zone,
    "referral_reward_status" "text",
    "recognition_photo_url" "text",
    "recognition_photo_confirmed" boolean DEFAULT false NOT NULL,
    "recognition_photo_updated_at" timestamp with time zone,
    "registration_reject_reason" "text",
    "registration_rejected_at" timestamp with time zone,
    "payment_reported_at" timestamp with time zone,
    "verification_source" "text",
    "payment_screenshot_path" "text",
    "phone" "text",
    "website" "text",
    "working_hours" "jsonb",
    "owner_title" "text",
    "name_for_emails" "text",
    "subscription_duration_months" integer,
    "subscription_price_list_mmk" bigint,
    "subscription_price_promo_mmk" bigint,
    "subscription_price_paid_mmk" bigint,
    "subscription_promo_applied" boolean DEFAULT false NOT NULL,
    "subscription_promo_percent" numeric(6,2),
    CONSTRAINT "stations_referral_reward_status_check" CHECK ((("referral_reward_status" = ANY (ARRAY['PENDING'::"text", 'PAID'::"text", 'COLLECTED'::"text"])) OR ("referral_reward_status" IS NULL))),
    CONSTRAINT "stations_subscription_duration_months_check" CHECK ((("subscription_duration_months" IS NULL) OR ("subscription_duration_months" = ANY (ARRAY[3, 6, 12])))),
    CONSTRAINT "stations_subscription_tier_requested_check" CHECK ((("subscription_tier_requested" = ANY (ARRAY['small'::"text", 'medium'::"text", 'large'::"text"])) OR ("subscription_tier_requested" IS NULL))),
    CONSTRAINT "stations_verification_source_check" CHECK ((("verification_source" IS NULL) OR ("verification_source" = ANY (ARRAY['distributor'::"text", 'crowd'::"text", 'owner'::"text"]))))
);


ALTER TABLE "public"."stations" OWNER TO "postgres";

--
-- Name: COLUMN "stations"."lat"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."stations"."lat" IS 'Physical latitude; null = address-only station, not shown on map until geocoded.';


--
-- Name: COLUMN "stations"."lng"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."stations"."lng" IS 'Physical longitude; null = address-only station, not shown on map until geocoded.';


--
-- Name: COLUMN "stations"."verification_source"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."stations"."verification_source" IS 'distributor = from official list (Max, Denko, BOC, etc.); crowd = 10 location reports applied; owner = claim + payment approved. Null = unverified, show grey.';


--
-- Name: COLUMN "stations"."phone"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."stations"."phone" IS 'Contact phone from trusted source (e.g. scraper).';


--
-- Name: COLUMN "stations"."website"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."stations"."website" IS 'Station or brand website.';


--
-- Name: COLUMN "stations"."working_hours"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."stations"."working_hours" IS 'Opening hours as JSON, e.g. {"Monday": ["4AM-9PM"], ...}.';


--
-- Name: COLUMN "stations"."owner_title"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."stations"."owner_title" IS 'Business/chain name from source (e.g. DENKO, Max Energy).';


--
-- Name: COLUMN "stations"."name_for_emails"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."stations"."name_for_emails" IS 'ASCII-friendly name for emails and exports.';


--
-- Name: COLUMN "stations"."subscription_duration_months"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."stations"."subscription_duration_months" IS 'Plan length (months) when operator reported payment; used for admin invoice and referral base.';


--
-- Name: COLUMN "stations"."subscription_price_paid_mmk"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."stations"."subscription_price_paid_mmk" IS 'Tax-inclusive total MMK snapshot at report time (from b2b_pricing_config quote).';


--
-- Name: status_votes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."status_votes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "report_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "device_hash" "text" NOT NULL,
    "vote" "public"."vote_type" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."status_votes" OWNER TO "postgres";

--
-- Name: subscriptions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "station_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "tier" "public"."subscription_tier" DEFAULT 'BASIC'::"public"."subscription_tier" NOT NULL,
    "starts_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ends_at" timestamp with time zone,
    "active" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."subscriptions" OWNER TO "postgres";

--
-- Name: user_legal_acceptances; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE IF NOT EXISTS "public"."user_legal_acceptances" (
    "user_id" "uuid" NOT NULL,
    "terms_accepted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "privacy_accepted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_legal_acceptances" OWNER TO "postgres";

--
-- Name: TABLE "user_legal_acceptances"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."user_legal_acceptances" IS 'Records when each user accepted Terms of Service and Privacy Policy for legal/audit purposes.';


--
-- Name: admin_users admin_users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."admin_users"
    ADD CONSTRAINT "admin_users_pkey" PRIMARY KEY ("user_id");


--
-- Name: alerts_log alerts_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."alerts_log"
    ADD CONSTRAINT "alerts_log_pkey" PRIMARY KEY ("id");


--
-- Name: b2b_pricing_config b2b_pricing_config_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."b2b_pricing_config"
    ADD CONSTRAINT "b2b_pricing_config_pkey" PRIMARY KEY ("id");


--
-- Name: b2b_subscriptions b2b_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."b2b_subscriptions"
    ADD CONSTRAINT "b2b_subscriptions_pkey" PRIMARY KEY ("id");


--
-- Name: contact_messages contact_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."contact_messages"
    ADD CONSTRAINT "contact_messages_pkey" PRIMARY KEY ("id");


--
-- Name: fuel_types fuel_types_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."fuel_types"
    ADD CONSTRAINT "fuel_types_code_key" UNIQUE ("code");


--
-- Name: fuel_types fuel_types_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."fuel_types"
    ADD CONSTRAINT "fuel_types_pkey" PRIMARY KEY ("id");


--
-- Name: inbox_messages inbox_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."inbox_messages"
    ADD CONSTRAINT "inbox_messages_pkey" PRIMARY KEY ("id");


--
-- Name: inbox_threads inbox_threads_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."inbox_threads"
    ADD CONSTRAINT "inbox_threads_pkey" PRIMARY KEY ("id");


--
-- Name: invoices invoices_invoice_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_invoice_number_key" UNIQUE ("invoice_number");


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_pkey" PRIMARY KEY ("id");


--
-- Name: payment_config payment_config_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."payment_config"
    ADD CONSTRAINT "payment_config_pkey" PRIMARY KEY ("id");


--
-- Name: push_subscriptions push_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id");


--
-- Name: push_subscriptions push_subscriptions_user_id_endpoint_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_endpoint_key" UNIQUE ("user_id", "endpoint");


--
-- Name: referral_codes referral_codes_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."referral_codes"
    ADD CONSTRAINT "referral_codes_code_key" UNIQUE ("code");


--
-- Name: referral_codes referral_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."referral_codes"
    ADD CONSTRAINT "referral_codes_pkey" PRIMARY KEY ("user_id");


--
-- Name: referral_rewards referral_rewards_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."referral_rewards"
    ADD CONSTRAINT "referral_rewards_pkey" PRIMARY KEY ("id");


--
-- Name: reporter_display_names reporter_display_names_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."reporter_display_names"
    ADD CONSTRAINT "reporter_display_names_pkey" PRIMARY KEY ("user_id");


--
-- Name: reward_events reward_events_period_type_user_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."reward_events"
    ADD CONSTRAINT "reward_events_period_type_user_unique" UNIQUE ("period_label", "reward_type", "user_id");


--
-- Name: reward_events reward_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."reward_events"
    ADD CONSTRAINT "reward_events_pkey" PRIMARY KEY ("id");


--
-- Name: routes routes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."routes"
    ADD CONSTRAINT "routes_pkey" PRIMARY KEY ("id");


--
-- Name: station_claims station_claims_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."station_claims"
    ADD CONSTRAINT "station_claims_pkey" PRIMARY KEY ("id");


--
-- Name: station_current_status station_current_status_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."station_current_status"
    ADD CONSTRAINT "station_current_status_pkey" PRIMARY KEY ("station_id");


--
-- Name: station_followers station_followers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."station_followers"
    ADD CONSTRAINT "station_followers_pkey" PRIMARY KEY ("user_id", "station_id");


--
-- Name: station_location_reports station_location_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."station_location_reports"
    ADD CONSTRAINT "station_location_reports_pkey" PRIMARY KEY ("id");


--
-- Name: station_status_reports station_status_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."station_status_reports"
    ADD CONSTRAINT "station_status_reports_pkey" PRIMARY KEY ("id");


--
-- Name: station_status_snapshots station_status_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."station_status_snapshots"
    ADD CONSTRAINT "station_status_snapshots_pkey" PRIMARY KEY ("id");


--
-- Name: station_suggestions station_suggestions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."station_suggestions"
    ADD CONSTRAINT "station_suggestions_pkey" PRIMARY KEY ("id");


--
-- Name: stations stations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."stations"
    ADD CONSTRAINT "stations_pkey" PRIMARY KEY ("id");


--
-- Name: status_votes status_votes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."status_votes"
    ADD CONSTRAINT "status_votes_pkey" PRIMARY KEY ("id");


--
-- Name: status_votes status_votes_report_id_device_hash_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."status_votes"
    ADD CONSTRAINT "status_votes_report_id_device_hash_key" UNIQUE ("report_id", "device_hash");


--
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id");


--
-- Name: user_legal_acceptances user_legal_acceptances_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_legal_acceptances"
    ADD CONSTRAINT "user_legal_acceptances_pkey" PRIMARY KEY ("user_id");


--
-- Name: alerts_user_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "alerts_user_idx" ON "public"."alerts_log" USING "btree" ("user_id", "sent_at" DESC);


--
-- Name: b2b_subscriptions_user_id_valid_until; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "b2b_subscriptions_user_id_valid_until" ON "public"."b2b_subscriptions" USING "btree" ("user_id", "valid_until");


--
-- Name: idx_push_subscriptions_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_push_subscriptions_user_id" ON "public"."push_subscriptions" USING "btree" ("user_id");


--
-- Name: idx_station_location_reports_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_station_location_reports_created_at" ON "public"."station_location_reports" USING "btree" ("created_at" DESC);


--
-- Name: idx_station_location_reports_station_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_station_location_reports_station_id" ON "public"."station_location_reports" USING "btree" ("station_id");


--
-- Name: idx_station_location_reports_unapplied; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_station_location_reports_unapplied" ON "public"."station_location_reports" USING "btree" ("station_id") WHERE (("suggested_lat" IS NOT NULL) AND ("suggested_lng" IS NOT NULL) AND ("applied_at" IS NULL));


--
-- Name: idx_station_status_reports_ip_hash; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_station_status_reports_ip_hash" ON "public"."station_status_reports" USING "btree" ("station_id", "ip_hash", "reported_at") WHERE ("ip_hash" IS NOT NULL);


--
-- Name: idx_station_status_snapshots_station_snapshot; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_station_status_snapshots_station_snapshot" ON "public"."station_status_snapshots" USING "btree" ("station_id", "snapshot_at" DESC);


--
-- Name: idx_station_suggestions_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_station_suggestions_status" ON "public"."station_suggestions" USING "btree" ("status");


--
-- Name: inbox_messages_thread_id_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "inbox_messages_thread_id_created_at" ON "public"."inbox_messages" USING "btree" ("thread_id", "created_at");


--
-- Name: inbox_threads_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "inbox_threads_status" ON "public"."inbox_threads" USING "btree" ("status");


--
-- Name: inbox_threads_user_id_last_message_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "inbox_threads_user_id_last_message_at" ON "public"."inbox_threads" USING "btree" ("user_id", "last_message_at" DESC NULLS LAST);


--
-- Name: invoices_customer_user_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "invoices_customer_user_id_idx" ON "public"."invoices" USING "btree" ("customer_user_id");


--
-- Name: invoices_issued_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "invoices_issued_at_idx" ON "public"."invoices" USING "btree" ("issued_at" DESC);


--
-- Name: referral_rewards_station_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "referral_rewards_station_unique" ON "public"."referral_rewards" USING "btree" ("station_id");


--
-- Name: reports_device_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "reports_device_idx" ON "public"."station_status_reports" USING "btree" ("device_hash", "reported_at" DESC);


--
-- Name: reports_flagged_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "reports_flagged_idx" ON "public"."station_status_reports" USING "btree" ("is_flagged") WHERE ("is_flagged" = true);


--
-- Name: reports_station_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "reports_station_idx" ON "public"."station_status_reports" USING "btree" ("station_id", "reported_at" DESC);


--
-- Name: station_claims_pending_user_station_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "station_claims_pending_user_station_unique" ON "public"."station_claims" USING "btree" ("user_id", "station_id") WHERE ("status" = 'PENDING'::"public"."claim_status");


--
-- Name: stations_country_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "stations_country_idx" ON "public"."stations" USING "btree" ("country_code") WHERE ("is_active" = true);


--
-- Name: stations_location_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "stations_location_idx" ON "public"."stations" USING "gist" ("location");


--
-- Name: subscriptions_station_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "subscriptions_station_idx" ON "public"."subscriptions" USING "btree" ("station_id");


--
-- Name: subscriptions_user_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "subscriptions_user_idx" ON "public"."subscriptions" USING "btree" ("user_id");


--
-- Name: votes_report_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "votes_report_idx" ON "public"."status_votes" USING "btree" ("report_id");


--
-- Name: inbox_messages inbox_messages_touch_thread; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "inbox_messages_touch_thread" AFTER INSERT ON "public"."inbox_messages" FOR EACH ROW EXECUTE FUNCTION "public"."inbox_touch_thread_on_message"();


--
-- Name: station_status_reports on_report_insert; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "on_report_insert" AFTER INSERT ON "public"."station_status_reports" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_recompute_on_report"();


--
-- Name: status_votes on_vote_insert; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "on_vote_insert" AFTER INSERT ON "public"."status_votes" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_recompute_on_vote"();


--
-- Name: stations sync_station_location_trigger; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE OR REPLACE TRIGGER "sync_station_location_trigger" BEFORE INSERT OR UPDATE OF "lat", "lng" ON "public"."stations" FOR EACH ROW EXECUTE FUNCTION "public"."sync_station_location_from_lat_lng"();


--
-- Name: alerts_log alerts_log_station_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."alerts_log"
    ADD CONSTRAINT "alerts_log_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE CASCADE;


--
-- Name: alerts_log alerts_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."alerts_log"
    ADD CONSTRAINT "alerts_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: b2b_subscriptions b2b_subscriptions_route_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."b2b_subscriptions"
    ADD CONSTRAINT "b2b_subscriptions_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("id") ON DELETE SET NULL;


--
-- Name: b2b_subscriptions b2b_subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."b2b_subscriptions"
    ADD CONSTRAINT "b2b_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: inbox_messages inbox_messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."inbox_messages"
    ADD CONSTRAINT "inbox_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: inbox_messages inbox_messages_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."inbox_messages"
    ADD CONSTRAINT "inbox_messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "public"."inbox_threads"("id") ON DELETE CASCADE;


--
-- Name: inbox_threads inbox_threads_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."inbox_threads"
    ADD CONSTRAINT "inbox_threads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: invoices invoices_b2b_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_b2b_subscription_id_fkey" FOREIGN KEY ("b2b_subscription_id") REFERENCES "public"."b2b_subscriptions"("id") ON DELETE SET NULL;


--
-- Name: invoices invoices_customer_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_customer_user_id_fkey" FOREIGN KEY ("customer_user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: invoices invoices_station_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE SET NULL;


--
-- Name: push_subscriptions push_subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: referral_rewards referral_rewards_station_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."referral_rewards"
    ADD CONSTRAINT "referral_rewards_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE CASCADE;


--
-- Name: reporter_display_names reporter_display_names_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."reporter_display_names"
    ADD CONSTRAINT "reporter_display_names_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: reward_events reward_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."reward_events"
    ADD CONSTRAINT "reward_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: station_claims station_claims_reviewer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."station_claims"
    ADD CONSTRAINT "station_claims_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: station_claims station_claims_station_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."station_claims"
    ADD CONSTRAINT "station_claims_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE CASCADE;


--
-- Name: station_claims station_claims_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."station_claims"
    ADD CONSTRAINT "station_claims_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: station_current_status station_current_status_station_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."station_current_status"
    ADD CONSTRAINT "station_current_status_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE CASCADE;


--
-- Name: station_followers station_followers_station_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."station_followers"
    ADD CONSTRAINT "station_followers_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE CASCADE;


--
-- Name: station_followers station_followers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."station_followers"
    ADD CONSTRAINT "station_followers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: station_location_reports station_location_reports_reported_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."station_location_reports"
    ADD CONSTRAINT "station_location_reports_reported_by_user_id_fkey" FOREIGN KEY ("reported_by_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: station_location_reports station_location_reports_station_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."station_location_reports"
    ADD CONSTRAINT "station_location_reports_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE CASCADE;


--
-- Name: station_status_reports station_status_reports_reporter_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."station_status_reports"
    ADD CONSTRAINT "station_status_reports_reporter_user_id_fkey" FOREIGN KEY ("reporter_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: station_status_reports station_status_reports_station_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."station_status_reports"
    ADD CONSTRAINT "station_status_reports_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE CASCADE;


--
-- Name: station_status_snapshots station_status_snapshots_station_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."station_status_snapshots"
    ADD CONSTRAINT "station_status_snapshots_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE CASCADE;


--
-- Name: station_suggestions station_suggestions_station_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."station_suggestions"
    ADD CONSTRAINT "station_suggestions_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE SET NULL;


--
-- Name: station_suggestions station_suggestions_suggested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."station_suggestions"
    ADD CONSTRAINT "station_suggestions_suggested_by_fkey" FOREIGN KEY ("suggested_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: stations stations_verified_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."stations"
    ADD CONSTRAINT "stations_verified_owner_id_fkey" FOREIGN KEY ("verified_owner_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: status_votes status_votes_report_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."status_votes"
    ADD CONSTRAINT "status_votes_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "public"."station_status_reports"("id") ON DELETE CASCADE;


--
-- Name: status_votes status_votes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."status_votes"
    ADD CONSTRAINT "status_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: subscriptions subscriptions_station_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE CASCADE;


--
-- Name: subscriptions subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: user_legal_acceptances user_legal_acceptances_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_legal_acceptances"
    ADD CONSTRAINT "user_legal_acceptances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: station_claims admin all claims; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "admin all claims" ON "public"."station_claims" USING (((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'role'::"text") = 'admin'::"text")) WITH CHECK (((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'role'::"text") = 'admin'::"text"));


--
-- Name: station_status_reports admin all reports; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "admin all reports" ON "public"."station_status_reports" USING (((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'role'::"text") = 'admin'::"text")) WITH CHECK (((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'role'::"text") = 'admin'::"text"));


--
-- Name: stations admin all stations; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "admin all stations" ON "public"."stations" USING (((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'role'::"text") = 'admin'::"text")) WITH CHECK (((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'role'::"text") = 'admin'::"text"));


--
-- Name: subscriptions admin all subscriptions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "admin all subscriptions" ON "public"."subscriptions" USING ((("auth"."jwt"() ->> 'role'::"text") = 'admin'::"text"));


--
-- Name: stations admin manage stations; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "admin manage stations" ON "public"."stations" USING ((("auth"."jwt"() ->> 'role'::"text") = 'admin'::"text"));


--
-- Name: admin_users; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."admin_users" ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_users admin_users_select_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "admin_users_select_own" ON "public"."admin_users" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));


--
-- Name: alerts_log; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."alerts_log" ENABLE ROW LEVEL SECURITY;

--
-- Name: b2b_pricing_config; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."b2b_pricing_config" ENABLE ROW LEVEL SECURITY;

--
-- Name: b2b_pricing_config b2b_pricing_insert_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "b2b_pricing_insert_admin" ON "public"."b2b_pricing_config" FOR INSERT TO "authenticated" WITH CHECK (((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'role'::"text") = 'admin'::"text"));


--
-- Name: b2b_pricing_config b2b_pricing_select_all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "b2b_pricing_select_all" ON "public"."b2b_pricing_config" FOR SELECT TO "authenticated", "anon" USING (true);


--
-- Name: b2b_pricing_config b2b_pricing_update_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "b2b_pricing_update_admin" ON "public"."b2b_pricing_config" FOR UPDATE TO "authenticated" USING (((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'role'::"text") = 'admin'::"text")) WITH CHECK (((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'role'::"text") = 'admin'::"text"));


--
-- Name: b2b_subscriptions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."b2b_subscriptions" ENABLE ROW LEVEL SECURITY;

--
-- Name: b2b_subscriptions b2b_subscriptions_select_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "b2b_subscriptions_select_own" ON "public"."b2b_subscriptions" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: contact_messages; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."contact_messages" ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_messages contact_messages_admin_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "contact_messages_admin_select" ON "public"."contact_messages" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = "auth"."uid"()))) OR ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'role'::"text") = 'admin'::"text")));


--
-- Name: fuel_types; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."fuel_types" ENABLE ROW LEVEL SECURITY;

--
-- Name: inbox_messages; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."inbox_messages" ENABLE ROW LEVEL SECURITY;

--
-- Name: inbox_messages inbox_messages_insert_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "inbox_messages_insert_admin" ON "public"."inbox_messages" FOR INSERT TO "authenticated" WITH CHECK ((("sender_id" = "auth"."uid"()) AND ("is_from_admin" = true) AND ((EXISTS ( SELECT 1
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = "auth"."uid"()))) OR ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'role'::"text") = 'admin'::"text")) AND (EXISTS ( SELECT 1
   FROM "public"."inbox_threads" "t"
  WHERE ("t"."id" = "inbox_messages"."thread_id")))));


--
-- Name: inbox_messages inbox_messages_insert_owner; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "inbox_messages_insert_owner" ON "public"."inbox_messages" FOR INSERT TO "authenticated" WITH CHECK ((("sender_id" = "auth"."uid"()) AND ("is_from_admin" = false) AND (EXISTS ( SELECT 1
   FROM "public"."inbox_threads" "t"
  WHERE (("t"."id" = "inbox_messages"."thread_id") AND ("t"."user_id" = "auth"."uid"()))))));


--
-- Name: inbox_messages inbox_messages_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "inbox_messages_select" ON "public"."inbox_messages" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."inbox_threads" "t"
  WHERE (("t"."id" = "inbox_messages"."thread_id") AND (("t"."user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."admin_users"
          WHERE ("admin_users"."user_id" = "auth"."uid"()))) OR ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'role'::"text") = 'admin'::"text"))))));


--
-- Name: inbox_threads; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."inbox_threads" ENABLE ROW LEVEL SECURITY;

--
-- Name: inbox_threads inbox_threads_insert_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "inbox_threads_insert_admin" ON "public"."inbox_threads" FOR INSERT TO "authenticated" WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = "auth"."uid"()))) OR ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'role'::"text") = 'admin'::"text")));


--
-- Name: inbox_threads inbox_threads_insert_owner; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "inbox_threads_insert_owner" ON "public"."inbox_threads" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));


--
-- Name: inbox_threads inbox_threads_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "inbox_threads_select" ON "public"."inbox_threads" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = "auth"."uid"()))) OR ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'role'::"text") = 'admin'::"text")));


--
-- Name: inbox_threads inbox_threads_update_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "inbox_threads_update_admin" ON "public"."inbox_threads" FOR UPDATE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = "auth"."uid"()))) OR ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'role'::"text") = 'admin'::"text"))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = "auth"."uid"()))) OR ((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'role'::"text") = 'admin'::"text")));


--
-- Name: inbox_threads inbox_threads_update_owner; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "inbox_threads_update_owner" ON "public"."inbox_threads" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));


--
-- Name: station_status_reports insert report; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "insert report" ON "public"."station_status_reports" FOR INSERT WITH CHECK (true);


--
-- Name: status_votes insert vote; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "insert vote" ON "public"."status_votes" FOR INSERT WITH CHECK (true);


--
-- Name: invoices; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."invoices" ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_config; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."payment_config" ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_config payment_config_insert_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "payment_config_insert_admin" ON "public"."payment_config" FOR INSERT TO "authenticated" WITH CHECK (((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'role'::"text") = 'admin'::"text"));


--
-- Name: payment_config payment_config_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "payment_config_select" ON "public"."payment_config" FOR SELECT TO "authenticated", "anon" USING (true);


--
-- Name: payment_config payment_config_update_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "payment_config_update_admin" ON "public"."payment_config" FOR UPDATE TO "authenticated" USING (((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'role'::"text") = 'admin'::"text")) WITH CHECK (((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'role'::"text") = 'admin'::"text"));


--
-- Name: station_current_status public read current status; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "public read current status" ON "public"."station_current_status" FOR SELECT USING (true);


--
-- Name: fuel_types public read fuel_types; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "public read fuel_types" ON "public"."fuel_types" FOR SELECT USING (true);


--
-- Name: stations public read stations; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "public read stations" ON "public"."stations" FOR SELECT USING (("is_active" = true));


--
-- Name: station_status_reports public read unflagged reports; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "public read unflagged reports" ON "public"."station_status_reports" FOR SELECT USING (("is_flagged" = false));


--
-- Name: status_votes public read votes; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "public read votes" ON "public"."status_votes" FOR SELECT USING (true);


--
-- Name: push_subscriptions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;

--
-- Name: push_subscriptions push_subscriptions_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "push_subscriptions_own" ON "public"."push_subscriptions" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: station_followers read follow count; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "read follow count" ON "public"."station_followers" FOR SELECT USING (true);


--
-- Name: referral_codes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."referral_codes" ENABLE ROW LEVEL SECURITY;

--
-- Name: referral_codes referral_codes_insert_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "referral_codes_insert_own" ON "public"."referral_codes" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));


--
-- Name: referral_codes referral_codes_select_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "referral_codes_select_own" ON "public"."referral_codes" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));


--
-- Name: referral_codes referral_codes_update_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "referral_codes_update_own" ON "public"."referral_codes" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));


--
-- Name: referral_rewards; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."referral_rewards" ENABLE ROW LEVEL SECURITY;

--
-- Name: referral_rewards referral_rewards_select_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "referral_rewards_select_admin" ON "public"."referral_rewards" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."admin_users"
  WHERE ("admin_users"."user_id" = "auth"."uid"()))));


--
-- Name: referral_rewards referral_rewards_select_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "referral_rewards_select_own" ON "public"."referral_rewards" FOR SELECT USING (("referrer_user_id" = "auth"."uid"()));


--
-- Name: reporter_display_names; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."reporter_display_names" ENABLE ROW LEVEL SECURITY;

--
-- Name: reporter_display_names reporter_display_names_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "reporter_display_names_own" ON "public"."reporter_display_names" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: reporter_display_names reporter_display_names_public_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "reporter_display_names_public_read" ON "public"."reporter_display_names" FOR SELECT USING (true);


--
-- Name: reward_events; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."reward_events" ENABLE ROW LEVEL SECURITY;

--
-- Name: reward_events reward_events_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "reward_events_admin" ON "public"."reward_events" USING (((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'role'::"text") = 'admin'::"text")) WITH CHECK (((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'role'::"text") = 'admin'::"text"));


--
-- Name: routes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."routes" ENABLE ROW LEVEL SECURITY;

--
-- Name: routes routes_select_active; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "routes_select_active" ON "public"."routes" FOR SELECT USING (true);


--
-- Name: alerts_log service role insert alerts; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "service role insert alerts" ON "public"."alerts_log" FOR INSERT WITH CHECK (true);


--
-- Name: station_current_status service role manage status; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "service role manage status" ON "public"."station_current_status" USING (true);


--
-- Name: station_claims; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."station_claims" ENABLE ROW LEVEL SECURITY;

--
-- Name: station_current_status; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."station_current_status" ENABLE ROW LEVEL SECURITY;

--
-- Name: station_followers; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."station_followers" ENABLE ROW LEVEL SECURITY;

--
-- Name: station_location_reports; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."station_location_reports" ENABLE ROW LEVEL SECURITY;

--
-- Name: station_location_reports station_location_reports_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "station_location_reports_insert" ON "public"."station_location_reports" FOR INSERT WITH CHECK (true);


--
-- Name: station_location_reports station_location_reports_select_service; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "station_location_reports_select_service" ON "public"."station_location_reports" FOR SELECT USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));


--
-- Name: station_status_reports; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."station_status_reports" ENABLE ROW LEVEL SECURITY;

--
-- Name: station_status_snapshots; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."station_status_snapshots" ENABLE ROW LEVEL SECURITY;

--
-- Name: station_suggestions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."station_suggestions" ENABLE ROW LEVEL SECURITY;

--
-- Name: station_suggestions station_suggestions_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "station_suggestions_admin" ON "public"."station_suggestions" USING (((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'role'::"text") = 'admin'::"text")) WITH CHECK (((("auth"."jwt"() -> 'app_metadata'::"text") ->> 'role'::"text") = 'admin'::"text"));


--
-- Name: station_suggestions station_suggestions_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "station_suggestions_insert" ON "public"."station_suggestions" FOR INSERT WITH CHECK ((("auth"."uid"() IS NOT NULL) AND ("suggested_by" = "auth"."uid"())));


--
-- Name: station_suggestions station_suggestions_select_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "station_suggestions_select_own" ON "public"."station_suggestions" FOR SELECT USING (("suggested_by" = "auth"."uid"()));


--
-- Name: stations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."stations" ENABLE ROW LEVEL SECURITY;

--
-- Name: status_votes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."status_votes" ENABLE ROW LEVEL SECURITY;

--
-- Name: subscriptions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."subscriptions" ENABLE ROW LEVEL SECURITY;

--
-- Name: station_claims user insert claim; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "user insert claim" ON "public"."station_claims" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: station_followers user manages own follows; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "user manages own follows" ON "public"."station_followers" USING (("auth"."uid"() = "user_id"));


--
-- Name: alerts_log user reads own alerts; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "user reads own alerts" ON "public"."alerts_log" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: station_claims user sees own claims; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "user sees own claims" ON "public"."station_claims" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: subscriptions user sees own subscriptions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "user sees own subscriptions" ON "public"."subscriptions" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: user_legal_acceptances; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."user_legal_acceptances" ENABLE ROW LEVEL SECURITY;

--
-- Name: user_legal_acceptances user_legal_acceptances_insert_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "user_legal_acceptances_insert_own" ON "public"."user_legal_acceptances" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));


--
-- Name: user_legal_acceptances user_legal_acceptances_select_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "user_legal_acceptances_select_own" ON "public"."user_legal_acceptances" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));


--
-- Name: SCHEMA "public"; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";


--
-- Name: FUNCTION "allocate_invoice_number"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."allocate_invoice_number"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."allocate_invoice_number"() TO "anon";
GRANT ALL ON FUNCTION "public"."allocate_invoice_number"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."allocate_invoice_number"() TO "service_role";


--
-- Name: FUNCTION "compute_station_status"("p_station_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."compute_station_status"("p_station_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."compute_station_status"("p_station_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."compute_station_status"("p_station_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "ensure_user_legal_acceptance"("p_terms_accepted_at" timestamp with time zone, "p_privacy_accepted_at" timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."ensure_user_legal_acceptance"("p_terms_accepted_at" timestamp with time zone, "p_privacy_accepted_at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_user_legal_acceptance"("p_terms_accepted_at" timestamp with time zone, "p_privacy_accepted_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_user_legal_acceptance"("p_terms_accepted_at" timestamp with time zone, "p_privacy_accepted_at" timestamp with time zone) TO "service_role";


--
-- Name: FUNCTION "get_all_stations_national"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."get_all_stations_national"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_all_stations_national"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_all_stations_national"() TO "service_role";


--
-- Name: FUNCTION "get_my_b2b_entitlements"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."get_my_b2b_entitlements"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_b2b_entitlements"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_b2b_entitlements"() TO "service_role";


--
-- Name: FUNCTION "get_my_reporter_stats"("period_days" integer); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."get_my_reporter_stats"("period_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_reporter_stats"("period_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_reporter_stats"("period_days" integer) TO "service_role";


--
-- Name: FUNCTION "get_nearby_stations"("user_lat" double precision, "user_lng" double precision, "radius_km" double precision); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."get_nearby_stations"("user_lat" double precision, "user_lng" double precision, "radius_km" double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."get_nearby_stations"("user_lat" double precision, "user_lng" double precision, "radius_km" double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_nearby_stations"("user_lat" double precision, "user_lng" double precision, "radius_km" double precision) TO "service_role";


--
-- Name: FUNCTION "get_station_reliability"("p_station_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."get_station_reliability"("p_station_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_station_reliability"("p_station_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_station_reliability"("p_station_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "get_station_uptime"("p_station_id" "uuid", "p_days" integer); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."get_station_uptime"("p_station_id" "uuid", "p_days" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_station_uptime"("p_station_id" "uuid", "p_days" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_station_uptime"("p_station_id" "uuid", "p_days" integer) TO "service_role";


--
-- Name: FUNCTION "get_stations_along_route"("p_route_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."get_stations_along_route"("p_route_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_stations_along_route"("p_route_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_stations_along_route"("p_route_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "get_top_reporters"("period_days" integer, "result_limit" integer); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."get_top_reporters"("period_days" integer, "result_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_top_reporters"("period_days" integer, "result_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_top_reporters"("period_days" integer, "result_limit" integer) TO "service_role";


--
-- Name: FUNCTION "inbox_admin_unread_thread_count"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."inbox_admin_unread_thread_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."inbox_admin_unread_thread_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."inbox_admin_unread_thread_count"() TO "service_role";


--
-- Name: FUNCTION "inbox_mark_thread_read"("p_thread_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."inbox_mark_thread_read"("p_thread_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."inbox_mark_thread_read"("p_thread_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."inbox_mark_thread_read"("p_thread_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "inbox_touch_thread_on_message"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."inbox_touch_thread_on_message"() TO "anon";
GRANT ALL ON FUNCTION "public"."inbox_touch_thread_on_message"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."inbox_touch_thread_on_message"() TO "service_role";


--
-- Name: FUNCTION "inbox_user_unread_thread_count"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."inbox_user_unread_thread_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."inbox_user_unread_thread_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."inbox_user_unread_thread_count"() TO "service_role";


--
-- Name: FUNCTION "role_base_weight"("role" "public"."reporter_role"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."role_base_weight"("role" "public"."reporter_role") TO "anon";
GRANT ALL ON FUNCTION "public"."role_base_weight"("role" "public"."reporter_role") TO "authenticated";
GRANT ALL ON FUNCTION "public"."role_base_weight"("role" "public"."reporter_role") TO "service_role";


--
-- Name: FUNCTION "role_decay_seconds"("role" "public"."reporter_role"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."role_decay_seconds"("role" "public"."reporter_role") TO "anon";
GRANT ALL ON FUNCTION "public"."role_decay_seconds"("role" "public"."reporter_role") TO "authenticated";
GRANT ALL ON FUNCTION "public"."role_decay_seconds"("role" "public"."reporter_role") TO "service_role";


--
-- Name: FUNCTION "sync_station_location_from_lat_lng"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."sync_station_location_from_lat_lng"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_station_location_from_lat_lng"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_station_location_from_lat_lng"() TO "service_role";


--
-- Name: FUNCTION "trigger_recompute_on_report"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."trigger_recompute_on_report"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_recompute_on_report"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_recompute_on_report"() TO "service_role";


--
-- Name: FUNCTION "trigger_recompute_on_vote"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."trigger_recompute_on_vote"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_recompute_on_vote"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_recompute_on_vote"() TO "service_role";


--
-- Name: TABLE "admin_users"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."admin_users" TO "anon";
GRANT ALL ON TABLE "public"."admin_users" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_users" TO "service_role";


--
-- Name: TABLE "alerts_log"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."alerts_log" TO "anon";
GRANT ALL ON TABLE "public"."alerts_log" TO "authenticated";
GRANT ALL ON TABLE "public"."alerts_log" TO "service_role";


--
-- Name: TABLE "b2b_pricing_config"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."b2b_pricing_config" TO "anon";
GRANT ALL ON TABLE "public"."b2b_pricing_config" TO "authenticated";
GRANT ALL ON TABLE "public"."b2b_pricing_config" TO "service_role";


--
-- Name: TABLE "b2b_subscriptions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."b2b_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."b2b_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."b2b_subscriptions" TO "service_role";


--
-- Name: TABLE "contact_messages"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."contact_messages" TO "anon";
GRANT ALL ON TABLE "public"."contact_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."contact_messages" TO "service_role";


--
-- Name: TABLE "fuel_types"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."fuel_types" TO "anon";
GRANT ALL ON TABLE "public"."fuel_types" TO "authenticated";
GRANT ALL ON TABLE "public"."fuel_types" TO "service_role";


--
-- Name: TABLE "inbox_messages"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."inbox_messages" TO "anon";
GRANT ALL ON TABLE "public"."inbox_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."inbox_messages" TO "service_role";


--
-- Name: TABLE "inbox_threads"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."inbox_threads" TO "anon";
GRANT ALL ON TABLE "public"."inbox_threads" TO "authenticated";
GRANT ALL ON TABLE "public"."inbox_threads" TO "service_role";


--
-- Name: SEQUENCE "invoice_number_seq"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE "public"."invoice_number_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."invoice_number_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."invoice_number_seq" TO "service_role";


--
-- Name: TABLE "invoices"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."invoices" TO "anon";
GRANT ALL ON TABLE "public"."invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."invoices" TO "service_role";


--
-- Name: TABLE "payment_config"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."payment_config" TO "anon";
GRANT ALL ON TABLE "public"."payment_config" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_config" TO "service_role";


--
-- Name: TABLE "push_subscriptions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."push_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "service_role";


--
-- Name: TABLE "referral_codes"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."referral_codes" TO "anon";
GRANT ALL ON TABLE "public"."referral_codes" TO "authenticated";
GRANT ALL ON TABLE "public"."referral_codes" TO "service_role";


--
-- Name: TABLE "referral_rewards"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."referral_rewards" TO "anon";
GRANT ALL ON TABLE "public"."referral_rewards" TO "authenticated";
GRANT ALL ON TABLE "public"."referral_rewards" TO "service_role";


--
-- Name: TABLE "reporter_display_names"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."reporter_display_names" TO "anon";
GRANT ALL ON TABLE "public"."reporter_display_names" TO "authenticated";
GRANT ALL ON TABLE "public"."reporter_display_names" TO "service_role";


--
-- Name: TABLE "reward_events"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."reward_events" TO "anon";
GRANT ALL ON TABLE "public"."reward_events" TO "authenticated";
GRANT ALL ON TABLE "public"."reward_events" TO "service_role";


--
-- Name: TABLE "routes"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."routes" TO "anon";
GRANT ALL ON TABLE "public"."routes" TO "authenticated";
GRANT ALL ON TABLE "public"."routes" TO "service_role";


--
-- Name: TABLE "station_claims"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."station_claims" TO "anon";
GRANT ALL ON TABLE "public"."station_claims" TO "authenticated";
GRANT ALL ON TABLE "public"."station_claims" TO "service_role";


--
-- Name: TABLE "station_current_status"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."station_current_status" TO "anon";
GRANT ALL ON TABLE "public"."station_current_status" TO "authenticated";
GRANT ALL ON TABLE "public"."station_current_status" TO "service_role";


--
-- Name: TABLE "station_followers"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."station_followers" TO "anon";
GRANT ALL ON TABLE "public"."station_followers" TO "authenticated";
GRANT ALL ON TABLE "public"."station_followers" TO "service_role";


--
-- Name: TABLE "station_location_reports"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."station_location_reports" TO "anon";
GRANT ALL ON TABLE "public"."station_location_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."station_location_reports" TO "service_role";


--
-- Name: TABLE "station_status_reports"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."station_status_reports" TO "anon";
GRANT ALL ON TABLE "public"."station_status_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."station_status_reports" TO "service_role";


--
-- Name: TABLE "station_status_snapshots"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."station_status_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."station_status_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."station_status_snapshots" TO "service_role";


--
-- Name: TABLE "station_suggestions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."station_suggestions" TO "anon";
GRANT ALL ON TABLE "public"."station_suggestions" TO "authenticated";
GRANT ALL ON TABLE "public"."station_suggestions" TO "service_role";


--
-- Name: TABLE "stations"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."stations" TO "anon";
GRANT ALL ON TABLE "public"."stations" TO "authenticated";
GRANT ALL ON TABLE "public"."stations" TO "service_role";


--
-- Name: TABLE "status_votes"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."status_votes" TO "anon";
GRANT ALL ON TABLE "public"."status_votes" TO "authenticated";
GRANT ALL ON TABLE "public"."status_votes" TO "service_role";


--
-- Name: TABLE "subscriptions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."subscriptions" TO "service_role";


--
-- Name: TABLE "user_legal_acceptances"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."user_legal_acceptances" TO "anon";
GRANT ALL ON TABLE "public"."user_legal_acceptances" TO "authenticated";
GRANT ALL ON TABLE "public"."user_legal_acceptances" TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
-- ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


--
-- PostgreSQL database dump complete
--

-- \unrestrict uWG9gg0cXA0S1ckDJH5VKXmAQNQPZKikneFh7m6iAhuBxyIyszkg3ycN8J5FsrB

