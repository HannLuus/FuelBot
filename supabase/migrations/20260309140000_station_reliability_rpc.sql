-- Option A: Activity-based reliability (reports count, verified share, vs city).
-- Returns one row per station for RPC get_station_reliability(station_id).

CREATE OR REPLACE FUNCTION public.get_station_reliability(p_station_id uuid)
RETURNS TABLE (
  reports_last_7d bigint,
  reports_last_30d bigint,
  verified_last_7d bigint,
  verified_last_30d bigint,
  last_updated_at timestamptz,
  city_name text,
  city_stations_count bigint,
  city_avg_reports_7d numeric,
  city_avg_reports_30d numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
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

-- Allow frontend (anon/authenticated) to call for any station (public stats only).
GRANT EXECUTE ON FUNCTION public.get_station_reliability(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_station_reliability(uuid) TO authenticated;
