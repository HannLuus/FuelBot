import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, json, requireAuthedUser } from '../_shared/adminAuth.ts'
import { resolveReferral } from '../_shared/referralResolver.ts'

interface Payload {
  station_id: string
  name?: string | null
  brand?: string | null
  subscription_tier_requested?: 'small' | 'medium' | 'large'
  referral_code?: string | null
  station_photo_urls?: string[]
  location_photo_url?: string | null
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

  if (!payload.station_id) return json({ error: 'station_id is required' }, 400)

  const service = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: station, error: stationErr } = await service
    .from('stations')
    .select('id, verified_owner_id, payment_received_at')
    .eq('id', payload.station_id)
    .single()

  if (stationErr || !station) return json({ error: 'Station not found' }, 404)
  if (station.verified_owner_id !== authed.user.id) return json({ error: 'Forbidden' }, 403)
  if (station.payment_received_at) return json({ error: 'Tier is locked after payment confirmation' }, 400)

  let referrerUserId: string | null | undefined = undefined
  let referralMatchedCode: string | undefined = undefined
  const referralCode = (payload.referral_code ?? '').trim()
  if (referralCode) {
    const resolved = await resolveReferral(service, referralCode, authed.user.id)
    if (!resolved) {
      const selfCheck = await resolveReferral(service, referralCode, null)
      if (selfCheck && selfCheck.user_id === authed.user.id) {
        return json({ error: 'Cannot use your own referral code' }, 400)
      }
      return json({ error: 'Invalid referral code' }, 400)
    }
    referrerUserId = resolved.user_id
    referralMatchedCode = resolved.code
  }

  const patch: Record<string, unknown> = {}
  if (typeof payload.name !== 'undefined') {
    const trimmed = (payload.name ?? '').toString().trim()
    if (trimmed.length >= 2) patch.name = trimmed
  }
  if (typeof payload.brand !== 'undefined') {
    patch.brand = (payload.brand ?? '').toString().trim() || null
  }
  if (payload.subscription_tier_requested) {
    patch.subscription_tier_requested = payload.subscription_tier_requested
  }
  if (typeof payload.location_photo_url !== 'undefined') {
    patch.location_photo_url = payload.location_photo_url
  }
  if (payload.station_photo_urls) {
    patch.station_photo_urls = payload.station_photo_urls
  }
  if (typeof referrerUserId !== 'undefined') {
    patch.referrer_user_id = referrerUserId
  }

  const { error: updateErr } = await service
    .from('stations')
    .update({
      ...patch,
      registration_reject_reason: null,
      registration_rejected_at: null,
    })
    .eq('id', payload.station_id)

  if (updateErr) {
    console.error('update-operator-verification error:', updateErr)
    return json({ error: 'Failed to update verification info' }, 500)
  }

  return json({ success: true, referral_matched: referralMatchedCode })
})
