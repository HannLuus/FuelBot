import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RATE_LIMIT_REPORTS_PER_HOUR = 3
const ANON_DAILY_CAP = 3
const MAX_DISTANCE_METRES = 1000
// Myanmar is UTC+6:30
const MYANMAR_OFFSET_MS = (6 * 60 + 30) * 60 * 1000

interface ReportPayload {
  station_id: string
  device_hash: string
  fuel_statuses: Record<string, string>
  queue_bucket: string
  note?: string | null
  user_lat?: number | null
  user_lng?: number | null
  reporter_role?: string
  // user_id intentionally NOT accepted from client — extracted from JWT server-side only
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

  // 1. Extract authenticated user from JWT (server-side only — never trust user_id from body)
  let verifiedUserId: string | null = null
  const authHeader = req.headers.get('Authorization')
  if (authHeader) {
    const anonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user } } = await anonClient.auth.getUser(
      authHeader.replace('Bearer ', ''),
    )
    if (user) verifiedUserId = user.id
  }

  let body: ReportPayload
  try {
    body = await req.json() as ReportPayload
  } catch {
    return jsonError('Invalid JSON', 400)
  }

  const { station_id, device_hash, fuel_statuses, queue_bucket, note, user_lat, user_lng, reporter_role } = body

  if (!station_id || !device_hash || !fuel_statuses) {
    return jsonError('Missing required fields', 400)
  }

  // 2. Verify station exists
  const { data: station, error: stationErr } = await supabase
    .from('stations')
    .select('id, lat, lng, is_verified, verified_owner_id')
    .eq('id', station_id)
    .single()

  if (stationErr || !station) return jsonError('Station not found', 404)

  // 3. Determine reporter role — identity comes from verified JWT, never from body
  let role = 'ANON'
  if (
    reporter_role === 'VERIFIED_STATION' &&
    verifiedUserId &&
    station.verified_owner_id === verifiedUserId &&
    station.is_verified === true  // must be admin-approved, not just self-registered
  ) {
    role = 'VERIFIED_STATION'
  } else if (verifiedUserId) {
    role = 'CROWD'
  } else {
    role = 'ANON'
  }

  // 4. Proximity check — mandatory for ANON and CROWD reporters
  if (role !== 'VERIFIED_STATION') {
    if (user_lat == null || user_lng == null) {
      return jsonError('LOCATION_REQUIRED: Share your location to submit a report', 400)
    }
    const distMetres = haversine(user_lat, user_lng, station.lat, station.lng)
    if (distMetres > MAX_DISTANCE_METRES) {
      return jsonError('TOO_FAR: You are too far from this station', 400)
    }
  }

  // 5a. Daily cap: authenticated CROWD reporters may submit at most once per Myanmar calendar day
  if (verifiedUserId && role !== 'VERIFIED_STATION') {
    const dayStartUtc = getMyanmarDayStartUtc()

    const { count: dayCount } = await supabase
      .from('station_status_reports')
      .select('id', { count: 'exact', head: true })
      .eq('reporter_user_id', verifiedUserId)
      .gte('reported_at', dayStartUtc)

    if ((dayCount ?? 0) >= 1) {
      return jsonError('DAILY_LIMIT: You have already reported today. Come back tomorrow.', 429)
    }
  }

  // 5b. Anonymous daily cap: device_hash may appear at most ANON_DAILY_CAP times per Myanmar day
  if (role === 'ANON') {
    const dayStartUtc = getMyanmarDayStartUtc()

    const { count: anonDayCount } = await supabase
      .from('station_status_reports')
      .select('id', { count: 'exact', head: true })
      .eq('device_hash', device_hash)
      .is('reporter_user_id', null)
      .gte('reported_at', dayStartUtc)

    if ((anonDayCount ?? 0) >= ANON_DAILY_CAP) {
      return jsonError('DAILY_LIMIT: Anonymous reporting limit reached for today. Sign in to report more.', 429)
    }
  }

  // 5c. Hourly rate limit: max RATE_LIMIT_REPORTS_PER_HOUR reports per device per station per hour
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

  // 5d. Server-side IP rate limit: secondary gate for anonymous reporters that cannot be forged
  if (role === 'ANON') {
    const callerIp = req.headers.get('x-real-ip') ??
      req.headers.get('cf-connecting-ip') ??
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()

    if (callerIp) {
      const ipHash = await hashIp(callerIp, station_id)
      const { count: ipCount } = await supabase
        .from('station_status_reports')
        .select('id', { count: 'exact', head: true })
        .eq('station_id', station_id)
        .eq('ip_hash', ipHash)
        .gte('reported_at', oneHourAgo)

      if ((ipCount ?? 0) >= RATE_LIMIT_REPORTS_PER_HOUR) {
        return jsonError('RATE_LIMIT: Too many reports. Please wait before reporting again', 429)
      }
    }
  }

  // 6. Compute expires_at based on role
  const decaySecs = roleDecaySeconds(role)
  const expiresAt = new Date(Date.now() + decaySecs * 1000).toISOString()

  // 7. Insert report
  const callerIp = req.headers.get('x-real-ip') ??
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const ipHash = (role === 'ANON' && callerIp)
    ? await hashIp(callerIp, station_id)
    : null

  const { data, error: insertErr } = await supabase
    .from('station_status_reports')
    .insert({
      station_id,
      reporter_user_id: verifiedUserId ?? null,
      reporter_role: role,
      fuel_statuses,
      queue_bucket: queue_bucket ?? 'NONE',
      note: note ?? null,
      device_hash,
      ip_hash: ipHash,
      expires_at: expiresAt,
    })
    .select()
    .single()

  if (insertErr) {
    // ip_hash column may not exist yet — retry without it for graceful rollout
    if (insertErr.message?.includes('ip_hash')) {
      const { data: data2, error: insertErr2 } = await supabase
        .from('station_status_reports')
        .insert({
          station_id,
          reporter_user_id: verifiedUserId ?? null,
          reporter_role: role,
          fuel_statuses,
          queue_bucket: queue_bucket ?? 'NONE',
          note: note ?? null,
          device_hash,
          expires_at: expiresAt,
        })
        .select()
        .single()

      if (insertErr2) {
        console.error('Insert error:', insertErr2)
        return jsonError('Failed to insert report', 500)
      }

      return new Response(JSON.stringify({ success: true, report: data2 }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

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

function getMyanmarDayStartUtc(): string {
  const nowMs = Date.now()
  const myanmarMs = nowMs + MYANMAR_OFFSET_MS
  const myanmarMidnight = new Date(myanmarMs)
  myanmarMidnight.setUTCHours(0, 0, 0, 0)
  return new Date(myanmarMidnight.getTime() - MYANMAR_OFFSET_MS).toISOString()
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

async function hashIp(ip: string, stationId: string): Promise<string> {
  const secret = Deno.env.get('IP_HASH_SECRET') ?? 'fuelbot-ip-rate-limit'
  const encoder = new TextEncoder()
  const data = encoder.encode(`${ip}:${stationId}:${secret}`)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
