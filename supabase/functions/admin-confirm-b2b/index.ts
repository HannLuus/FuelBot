import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, json, requireAdminUser } from '../_shared/adminAuth.ts'

interface Payload {
  subscription_id: string
  action: 'confirm' | 'reject'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders() })
  }

  const authed = await requireAdminUser(req.headers.get('Authorization'))
  if ('error' in authed) return authed.error

  let payload: Payload
  try {
    payload = await req.json() as Payload
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const { subscription_id, action } = payload
  if (!subscription_id || (action !== 'confirm' && action !== 'reject')) {
    return json({ error: 'subscription_id and action ("confirm" | "reject") are required' }, 400)
  }

  const service = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const newStatus = action === 'confirm' ? 'CONFIRMED' : 'REJECTED'

  const { data, error: updateErr } = await service
    .from('b2b_subscriptions')
    .update({ status: newStatus })
    .eq('id', subscription_id)
    .eq('status', 'PENDING')
    .select('id, user_id, status')
    .single()

  if (updateErr || !data) {
    console.error('admin-confirm-b2b update error:', updateErr)
    return json({ error: 'Subscription not found or not in PENDING state' }, 404)
  }

  return json({ success: true, subscription: data })
})
