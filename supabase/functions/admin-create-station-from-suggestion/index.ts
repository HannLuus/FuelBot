import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, json, requireAdminUser } from '../_shared/adminAuth.ts'

interface Payload {
  suggestion_id?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders() })
  }

  const admin = await requireAdminUser(req.headers.get('Authorization'))
  if ('error' in admin) return admin.error

  let payload: Payload
  try {
    payload = await req.json() as Payload
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const suggestionId = String(payload.suggestion_id ?? '').trim()
  if (!suggestionId) return json({ error: 'suggestion_id is required' }, 400)

  const service = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: suggestion, error: suggestionErr } = await service
    .from('station_suggestions')
    .select('id, name, city, address, lat, lng, note, suggested_by, station_id, status, approved_at')
    .eq('id', suggestionId)
    .maybeSingle()

  if (suggestionErr) return json({ error: suggestionErr.message }, 500)
  if (!suggestion) return json({ error: 'Suggestion not found' }, 404)
  if (suggestion.status === 'rejected') {
    return json({ error: 'Cannot create station from a rejected suggestion' }, 400)
  }

  const suggestionName = String(suggestion.name ?? '').trim()
  if (suggestionName.length < 2) {
    return json({ error: 'Suggestion name is invalid' }, 400)
  }

  const nowIso = new Date().toISOString()

  // Idempotent path: a station has already been created and linked.
  if (suggestion.station_id) {
    if (suggestion.status !== 'approved' || suggestion.approved_at == null) {
      await service
        .from('station_suggestions')
        .update({
          status: 'approved',
          approved_at: suggestion.approved_at ?? nowIso,
        })
        .eq('id', suggestion.id)
    }
    return json({ success: true, station_id: suggestion.station_id, already_exists: true })
  }

  const city = String(suggestion.city ?? '').trim() || 'Yangon'
  const township = city

  const { data: station, error: stationErr } = await service
    .from('stations')
    .insert({
      name: suggestionName,
      brand: null,
      address_text: suggestion.address?.trim() || null,
      township,
      city,
      country_code: 'MM',
      lat: suggestion.lat ?? null,
      lng: suggestion.lng ?? null,
      is_active: true,
      is_verified: false,
      verified_owner_id: null,
      subscription_tier_requested: null,
      // No anonymous referral: only assign when suggester user_id exists.
      referrer_user_id: suggestion.suggested_by ?? null,
      registration_reject_reason: null,
      registration_rejected_at: null,
    })
    .select('id')
    .single()

  if (stationErr || !station) {
    return json({ error: stationErr?.message ?? 'Failed to create station' }, 500)
  }

  const { error: updateErr } = await service
    .from('station_suggestions')
    .update({ status: 'approved', station_id: station.id, approved_at: nowIso })
    .eq('id', suggestion.id)

  if (updateErr) {
    return json({
      error: `Station created (${station.id}) but failed to update suggestion: ${updateErr.message}`,
    }, 500)
  }

  return json({ success: true, station_id: station.id, already_exists: false })
})
