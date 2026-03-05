import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, json, requireAuthedUser } from '../_shared/adminAuth.ts'

interface Payload {
  station_id: string
  recognition_photo_url: string
  recognition_photo_confirmed: boolean
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders() })
  }

  const authed = await requireAuthedUser(req.headers.get('Authorization'))
  if ('error' in authed) return authed.error

  let payload: Payload
  try {
    payload = await req.json() as Payload
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  if (!payload.station_id || !payload.recognition_photo_url) {
    return json({ error: 'station_id and recognition_photo_url are required' }, 400)
  }

  const service = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: station, error: stationErr } = await service
    .from('stations')
    .select('id, verified_owner_id, is_verified')
    .eq('id', payload.station_id)
    .single()

  if (stationErr || !station) return json({ error: 'Station not found' }, 404)
  if (station.verified_owner_id !== authed.user.id) return json({ error: 'Forbidden' }, 403)
  if (!station.is_verified) return json({ error: 'Station must be approved first' }, 400)

  const { error } = await service
    .from('stations')
    .update({
      recognition_photo_url: payload.recognition_photo_url,
      recognition_photo_confirmed: payload.recognition_photo_confirmed,
      recognition_photo_updated_at: new Date().toISOString(),
    })
    .eq('id', payload.station_id)

  if (error) {
    console.error('update-recognition-photo error:', error)
    return json({ error: 'Failed to update recognition photo' }, 500)
  }

  return json({ success: true })
})
