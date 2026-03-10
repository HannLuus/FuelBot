import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, json, requireAuthedUser } from '../_shared/adminAuth.ts'

const MYANMAR_BOUNDS = { latMin: 9.5, latMax: 28.5, lngMin: 92, lngMax: 101 }

interface Payload {
  station_id: string
  lat: number
  lng: number
}

function inMyanmar(lat: number, lng: number): boolean {
  return (
    lat >= MYANMAR_BOUNDS.latMin &&
    lat <= MYANMAR_BOUNDS.latMax &&
    lng >= MYANMAR_BOUNDS.lngMin &&
    lng <= MYANMAR_BOUNDS.lngMax
  )
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders() })
  }

  const authed = await requireAuthedUser(req.headers.get('Authorization'))
  if ('error' in authed) return authed.error

  let payload: Payload
  try {
    payload = (await req.json()) as Payload
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const { station_id, lat, lng } = payload
  if (!station_id || typeof station_id !== 'string') {
    return json({ error: 'station_id is required' }, 400)
  }
  if (
    typeof lat !== 'number' ||
    typeof lng !== 'number' ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ) {
    return json({ error: 'lat and lng are required and must be numbers' }, 400)
  }
  if (!inMyanmar(lat, lng)) {
    return json({ error: 'Coordinates must be within Myanmar' }, 400)
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
  if (station.verified_owner_id !== authed.user.id) {
    return json({ error: 'Forbidden: you are not the owner of this station' }, 403)
  }
  if (!station.payment_received_at) {
    return json({ error: 'Only the paying owner can update location. Payment not yet confirmed.' }, 403)
  }

  const { error: updateErr } = await service
    .from('stations')
    .update({ lat, lng })
    .eq('id', station_id)

  if (updateErr) {
    console.error('owner-update-station-location error:', updateErr)
    return json({ error: 'Failed to update location' }, 500)
  }

  return json({ success: true })
})
