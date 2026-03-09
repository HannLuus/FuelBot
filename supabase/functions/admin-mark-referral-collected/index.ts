import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, json, requireAdminUser } from '../_shared/adminAuth.ts'

interface Payload {
  station_id: string
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

  if (!payload.station_id) return json({ error: 'station_id is required' }, 400)

  const service = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: reward, error: rewardErr } = await service
    .from('referral_rewards')
    .select('id, status')
    .eq('station_id', payload.station_id)
    .maybeSingle()

  if (rewardErr || !reward) return json({ error: 'Referral reward not found' }, 404)
  if (reward.status !== 'PENDING') return json({ error: 'Reward is not pending' }, 400)

  const now = new Date().toISOString()
  const { error: updateRewardErr } = await service
    .from('referral_rewards')
    .update({ status: 'COLLECTED', paid_at: now })
    .eq('station_id', payload.station_id)

  if (updateRewardErr) {
    console.error('admin-mark-referral-collected reward update error:', updateRewardErr)
    return json({ error: 'Failed to update reward' }, 500)
  }

  const { error: updateStationErr } = await service
    .from('stations')
    .update({ referral_reward_status: 'COLLECTED' })
    .eq('id', payload.station_id)

  if (updateStationErr) {
    console.error('admin-mark-referral-collected station update error:', updateStationErr)
  }

  return json({ success: true })
})
