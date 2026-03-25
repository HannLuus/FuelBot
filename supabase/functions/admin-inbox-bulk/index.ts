import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, json, requireAdminUser } from '../_shared/adminAuth.ts'

type Segment = 'active_b2b' | 'all_users' | 'paid_station_owners'

interface Payload {
  segment: Segment
  subject: string
  body: string
  max_users?: number
}

const SEGMENTS: Segment[] = ['active_b2b', 'all_users', 'paid_station_owners']

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

  const subject = String(payload.subject ?? '').trim()
  const body = String(payload.body ?? '').trim()
  const maxUsers = Math.min(Math.max(1, Number(payload.max_users) || 500), 2000)

  if (!subject || !body) {
    return json({ error: 'subject and body are required' }, 400)
  }
  if (!SEGMENTS.includes(payload.segment)) {
    return json({ error: 'invalid segment' }, 400)
  }

  const service = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  let userIds: string[] = []

  if (payload.segment === 'active_b2b') {
    const { data, error } = await service
      .from('b2b_subscriptions')
      .select('user_id')
      .eq('status', 'CONFIRMED')
      .gt('valid_until', new Date().toISOString())
    if (error) {
      console.error('admin-inbox-bulk active_b2b:', error)
      return json({ error: error.message }, 500)
    }
    userIds = [...new Set((data ?? []).map((r: { user_id: string }) => r.user_id))]
  } else if (payload.segment === 'paid_station_owners') {
    const { data, error } = await service
      .from('stations')
      .select('verified_owner_id')
      .not('payment_received_at', 'is', null)
      .not('verified_owner_id', 'is', null)
    if (error) {
      console.error('admin-inbox-bulk paid_station_owners:', error)
      return json({ error: error.message }, 500)
    }
    userIds = [
      ...new Set(
        (data ?? [])
          .map((r: { verified_owner_id: string | null }) => r.verified_owner_id)
          .filter((id): id is string => Boolean(id)),
      ),
    ]
  } else {
    const collected: string[] = []
    let page = 1
    const perPage = 200
    while (collected.length < maxUsers) {
      const { data: pageData, error } = await service.auth.admin.listUsers({ page, perPage })
      if (error) {
        console.error('admin-inbox-bulk listUsers:', error)
        return json({ error: error.message }, 500)
      }
      const users = pageData?.users ?? []
      for (const u of users) {
        collected.push(u.id)
        if (collected.length >= maxUsers) break
      }
      if (users.length < perPage) break
      page++
    }
    userIds = collected
  }

  userIds = userIds.slice(0, maxUsers)
  const bulkBatchId = crypto.randomUUID()
  const adminId = authed.user.id
  let created = 0
  const errors: string[] = []

  for (const uid of userIds) {
    const { data: thread, error: tErr } = await service
      .from('inbox_threads')
      .insert({
        user_id: uid,
        subject,
        status: 'open',
        bulk_batch_id: bulkBatchId,
      })
      .select('id')
      .single()

    if (tErr || !thread) {
      errors.push(`${uid}: ${tErr?.message ?? 'thread'}`)
      continue
    }

    const { error: mErr } = await service.from('inbox_messages').insert({
      thread_id: thread.id,
      sender_id: adminId,
      is_from_admin: true,
      body,
    })

    if (mErr) {
      errors.push(`${uid}: ${mErr.message}`)
      continue
    }
    created++
  }

  return json({
    ok: true,
    bulk_batch_id: bulkBatchId,
    targeted: userIds.length,
    threads_created: created,
    errors: errors.slice(0, 30),
  })
})
