import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  })
}

export async function requireAuthedUser(authHeader: string | null) {
  if (!authHeader) return { error: json({ error: 'Unauthorized' }, 401) }

  const client = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )

  const token = authHeader.replace('Bearer ', '')
  const { data, error } = await client.auth.getUser(token)
  if (error || !data.user) return { error: json({ error: 'Unauthorized' }, 401) }

  return { user: data.user }
}

export async function requireAdminUser(authHeader: string | null) {
  const authed = await requireAuthedUser(authHeader)
  if (authed.error) return authed

  const user = authed.user
  const role = user.app_metadata?.role
  if (role === 'admin') return { user }

  const service = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  const { data } = await service
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!data) return { error: json({ error: 'Forbidden' }, 403) }
  return { user }
}
