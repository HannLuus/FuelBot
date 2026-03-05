import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, json, requireAuthedUser } from '../_shared/adminAuth.ts'

function createReferralCode(seed: string): string {
  const token = seed.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(-8).padEnd(8, 'X')
  return `FB-${token}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders() })
  }

  const authed = await requireAuthedUser(req.headers.get('Authorization'))
  if ('error' in authed) return authed.error

  const service = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const existing = await service
    .from('referral_codes')
    .select('code')
    .eq('user_id', authed.user.id)
    .maybeSingle()

  if (existing.data?.code) return json({ success: true, code: existing.data.code })

  const code = createReferralCode(authed.user.id)
  const { error } = await service
    .from('referral_codes')
    .upsert({ user_id: authed.user.id, code }, { onConflict: 'user_id' })

  if (error) {
    console.error('get-referral-code upsert error:', error)
    return json({ error: 'Failed to create referral code' }, 500)
  }

  return json({ success: true, code })
})
