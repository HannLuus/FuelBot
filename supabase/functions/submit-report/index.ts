import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RATE_LIMIT_REPORTS_PER_HOUR = 3
const MAX_DISTANCE_METRES = 1000

interface ReportPayload {
  station_id: string
  device_hash: string
  fuel_statuses: Record<string, string>
  queue_bucket: string
  note?: string | null
  user_lat?: number | null
  user_lng?: number | null
  reporter_role?: string
  user_id?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  let body: ReportPayload
  try {
    body = await req.json() as ReportPayload
  } catch {
    return jsonError('Invalid JSON', 400)
  }

  const { station_id, device_hash, fuel_statuses, queue_bucket, note, user_lat, user_lng, reporter_role, user_id } = body

  if (!station_id || !device_hash || !fuel_statuses) {
    return jsonError('Missing required fields', 400)
  }

  // 1. Verify station exists
  const { data: station, error: stationErr } = await supabase
    .from('stations')
    .select('id, lat, lng, is_verified, verified_owner_id')
    .eq('id', station_id)
    .single()

  if (stationErr || !station) return jsonError('Station not found', 404)

  // 2. Determine reporter role
  let role = 'ANON'
  if (reporter_role === 'VERIFIED_STATION' && user_id && station.verified_owner_id === user_id) {
    role = 'VERIFIED_STATION'
  } else if (user_id) {
    // Check if trusted reporter (could be a DB lookup for trusted role in future)
    role = 'CROWD'
  } else {
    role = 'ANON'
  }

  // 3. Proximity check (for non-verified-station reports, if coordinates provided)
  if (role !== 'VERIFIED_STATION' && user_lat != null && user_lng != null) {
    const distMetres = haversine(user_lat, user_lng, station.lat, station.lng)
    if (distMetres > MAX_DISTANCE_METRES) {
      return jsonError('TOO_FAR: You are too far from this station', 400)
    }
  }

  // 4. Rate limit: max RATE_LIMIT_REPORTS_PER_HOUR reports per device per station per hour
  const oneHourAgo = new Date(Date.now() - 3600000).toISOString()
  const { count } = await supabase
    .from('station_status_reports')
    .select('id', { count: 'exact', head: true })
    .eq('station_id', station_id)
    .eq('device_hash', device_hash)
    .gte('reported_at', oneHourAgo)

  if ((count ?? 0) >= RATE_LIMIT_REPORTS_PER_HOUR) {
    return jsonError('RATE_LIMIT: Too many reports. Please wait before reporting again', 429)
  }

  // 5. Compute expires_at based on role
  const decaySecs = roleDecaySeconds(role)
  const expiresAt = new Date(Date.now() + decaySecs * 1000).toISOString()

  // 6. Insert report
  const { data, error: insertErr } = await supabase
    .from('station_status_reports')
    .insert({
      station_id,
      reporter_user_id: user_id ?? null,
      reporter_role: role,
      fuel_statuses,
      queue_bucket: queue_bucket ?? 'NONE',
      note: note ?? null,
      device_hash,
      expires_at: expiresAt,
    })
    .select()
    .single()

  if (insertErr) {
    console.error('Insert error:', insertErr)
    return jsonError('Failed to insert report', 500)
  }

  return new Response(JSON.stringify({ success: true, report: data }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
})

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}

function roleDecaySeconds(role: string): number {
  switch (role) {
    case 'VERIFIED_STATION': return 14400
    case 'TRUSTED': return 7200
    case 'CROWD': return 3600
    default: return 1800
  }
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
