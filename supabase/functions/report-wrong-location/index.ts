import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, json } from '../_shared/adminAuth.ts'

const MYANMAR_BOUNDS = { latMin: 9.5, latMax: 28.5, lngMin: 92, lngMax: 101 }
const CROWD_THRESHOLD = 10

interface Payload {
  station_id: string
  note?: string | null
  suggested_lat?: number | null
  suggested_lng?: number | null
}

function inMyanmar(lat: number, lng: number): boolean {
  return (
    lat >= MYANMAR_BOUNDS.latMin &&
    lat <= MYANMAR_BOUNDS.latMax &&
    lng >= MYANMAR_BOUNDS.lngMin &&
    lng <= MYANMAR_BOUNDS.lngMax
  )
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders() })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  let body: Payload
  try {
    body = (await req.json()) as Payload
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const { station_id, note, suggested_lat, suggested_lng } = body
  if (!station_id || typeof station_id !== 'string') {
    return json({ error: 'station_id is required' }, 400)
  }

  const hasLat = suggested_lat != null && typeof suggested_lat === 'number' && Number.isFinite(suggested_lat)
  const hasLng = suggested_lng != null && typeof suggested_lng === 'number' && Number.isFinite(suggested_lng)
  if (hasLat !== hasLng) {
    return json({ error: 'Provide both suggested_lat and suggested_lng or neither' }, 400)
  }
  if (hasLat && hasLng && !inMyanmar(suggested_lat, suggested_lng)) {
    return json({ error: 'Suggested coordinates must be within Myanmar' }, 400)
  }

  const service = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: station, error: stationErr } = await service
    .from('stations')
    .select('id, verified_owner_id, payment_received_at')
    .eq('id', station_id)
    .single()

  if (stationErr || !station) {
    return json({ error: 'Station not found' }, 404)
  }

  let reported_by_user_id: string | null = null
  const authHeader = req.headers.get('Authorization')
  if (authHeader) {
    const anon = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const token = authHeader.replace('Bearer ', '')
    const { data: { user } } = await anon.auth.getUser(token)
    if (user) reported_by_user_id = user.id
  }

  const insertRow: Record<string, unknown> = {
    station_id,
    reported_by_user_id,
    note: (note && String(note).trim()) || null,
  }
  if (hasLat && hasLng) {
    insertRow.suggested_lat = suggested_lat
    insertRow.suggested_lng = suggested_lng
  }

  const { error: insertErr } = await service.from('station_location_reports').insert(insertRow)

  if (insertErr) {
    console.error('report-wrong-location insert error:', insertErr)
    return json({ error: 'Failed to save report' }, 500)
  }

  const hasPayingOwner =
    station.verified_owner_id != null && station.payment_received_at != null

  if (!hasPayingOwner && hasLat && hasLng) {
    const { data: unapplied } = await service
      .from('station_location_reports')
      .select('id, suggested_lat, suggested_lng')
      .eq('station_id', station_id)
      .not('suggested_lat', 'is', null)
      .not('suggested_lng', 'is', null)
      .is('applied_at', null)

    if (unapplied && unapplied.length >= CROWD_THRESHOLD) {
      const lats = unapplied.map((r) => r.suggested_lat as number)
      const lngs = unapplied.map((r) => r.suggested_lng as number)
      const medianLat = median(lats)
      const medianLng = median(lngs)

      const { error: updateStationErr } = await service
        .from('stations')
        .update({ lat: medianLat, lng: medianLng, verification_source: 'crowd' })
        .eq('id', station_id)

      if (!updateStationErr) {
        const ids = unapplied.map((r) => r.id)
        await service
          .from('station_location_reports')
          .update({ applied_at: new Date().toISOString() })
          .in('id', ids)
      }
    }
  }

  return json({ success: true })
})
