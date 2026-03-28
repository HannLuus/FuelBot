// Renewals: call this again (or update the station row) so payment_received_at reflects the new paid period
// and subscription_duration_months matches the term. Included route/corridor access uses payment_received_at +
// COALESCE(subscription_duration_months, 12) in station_owner_route_bundle_valid_until().
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, json, requireAdminUser } from '../_shared/adminAuth.ts'

interface Payload {
  station_id: string
  payment_method: 'KBZ_PAY'
  payment_reference?: string
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

  if (!payload.station_id) {
    return json({ error: 'station_id is required' }, 400)
  }
  if (payload.payment_method !== 'KBZ_PAY') {
    return json({ error: 'Only KBZ Pay (KPay) is supported' }, 400)
  }

  const service = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const refTrim = payload.payment_reference?.trim()
  const patch: Record<string, unknown> = {
    payment_received_at: new Date().toISOString(),
    payment_method: payload.payment_method,
    payment_confirmed_by: admin.user.id,
  }
  // Keep the station-owner-submitted reference when admin leaves this blank.
  if (refTrim) {
    patch.payment_reference = refTrim
  }

  const { error } = await service.from('stations').update(patch).eq('id', payload.station_id)

  if (error) {
    console.error('admin-mark-payment error:', error)
    return json({ error: 'Failed to mark payment' }, 500)
  }

  return json({ success: true })
})
