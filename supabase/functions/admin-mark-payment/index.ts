import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, json, requireAdminUser } from '../_shared/adminAuth.ts'

interface Payload {
  station_id: string
  payment_method: 'KBZ_PAY' | 'WAVEPAY' | 'BANK_TRANSFER'
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

  if (!payload.station_id || !payload.payment_method) {
    return json({ error: 'station_id and payment_method are required' }, 400)
  }

  const service = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { error } = await service
    .from('stations')
    .update({
      payment_received_at: new Date().toISOString(),
      payment_method: payload.payment_method,
      payment_reference: payload.payment_reference?.trim() || null,
      payment_confirmed_by: admin.user.id,
    })
    .eq('id', payload.station_id)

  if (error) {
    console.error('admin-mark-payment error:', error)
    return json({ error: 'Failed to mark payment' }, 500)
  }

  return json({ success: true })
})
