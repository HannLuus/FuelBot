/**
 * Edge Function: send-fuel-alerts
 *
 * Called by a Supabase Database Webhook when station_current_status changes.
 * For each station where a fuel type flipped from OUT → AVAILABLE, sends Web Push
 * notifications to all followers who have registered a push subscription.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3'

const PUSH_BATCH_SIZE = 100

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE'
  table: string
  record: {
    station_id: string
    fuel_statuses_computed: Record<string, string>
  }
  old_record?: {
    station_id: string
    fuel_statuses_computed: Record<string, string>
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  // Fail-closed: reject the request if the secret is missing OR wrong.
  // This prevents unauthenticated callers from triggering spam push notifications.
  const webhookSecret = Deno.env.get('SEND_FUEL_ALERTS_WEBHOOK_SECRET')
  const incoming = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!webhookSecret || incoming !== webhookSecret) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const payload = await req.json() as WebhookPayload

  if (payload.type !== 'UPDATE' || !payload.old_record) {
    return new Response('OK')
  }

  const newStatuses = payload.record.fuel_statuses_computed ?? {}
  const oldStatuses = payload.old_record.fuel_statuses_computed ?? {}
  const stationId = payload.record.station_id

  // Find fuel types that flipped from OUT → AVAILABLE
  const backInStock = Object.entries(newStatuses).filter(([code, status]) => {
    return status === 'AVAILABLE' && oldStatuses[code] === 'OUT'
  })

  if (backInStock.length === 0) {
    return new Response('OK – no status flip detected')
  }

  const fuelCodesBack = backInStock.map(([code]) => code).join(', ')
  console.log(`Station ${stationId}: ${fuelCodesBack} back in stock`)

  // Get followers
  const { data: followers } = await supabase
    .from('station_followers')
    .select('user_id')
    .eq('station_id', stationId)

  if (!followers || followers.length === 0) {
    return new Response('OK – no followers')
  }

  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@fuelbot.app'

  if (!vapidPublicKey || !vapidPrivateKey) {
    console.warn('send-fuel-alerts: VAPID keys not set, skipping push delivery')
    // Still log the alert even if push is unconfigured
    const alertRows = followers.map((f: { user_id: string }) => ({
      user_id: f.user_id,
      station_id: stationId,
      trigger: 'FUEL_BACK_IN_STOCK',
      channel: 'PUSH',
    }))
    await supabase.from('alerts_log').insert(alertRows)
    return new Response(
      JSON.stringify({ logged: followers.length, pushed: 0, fuels: fuelCodesBack }),
      { headers: { 'Content-Type': 'application/json' } },
    )
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)

  const followerIds = followers.map((f: { user_id: string }) => f.user_id)
  const { data: subscriptions } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .in('user_id', followerIds)

  const stationPageUrl = `${Deno.env.get('APP_URL') ?? 'https://fuelbot.vercel.app'}/station/${stationId}`
  const pushPayload = JSON.stringify({
    title: 'Fuel back in stock!',
    body: `${fuelCodesBack} is now available nearby.`,
    url: stationPageUrl,
    icon: '/FuelbotLogo.png',
  })

  let pushed = 0
  const allSubs = subscriptions ?? []

  // Deliver in batches to avoid exhausting the Deno connection pool
  for (let i = 0; i < allSubs.length; i += PUSH_BATCH_SIZE) {
    const batch = allSubs.slice(i, i + PUSH_BATCH_SIZE)
    await Promise.allSettled(
      batch.map(async (sub: { endpoint: string; p256dh: string; auth: string }) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            pushPayload,
          )
          pushed++
        } catch (err: unknown) {
          const status = (err as { statusCode?: number })?.statusCode
          if (status === 404 || status === 410) {
            // Subscription is no longer valid — clean it up
            await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
          } else {
            console.error('Push delivery error:', err)
          }
        }
      }),
    )
  }

  // Log alerts after delivery so the record reflects actual delivery attempt
  const alertRows = followers.map((f: { user_id: string }) => ({
    user_id: f.user_id,
    station_id: stationId,
    trigger: 'FUEL_BACK_IN_STOCK',
    channel: 'PUSH',
  }))
  await supabase.from('alerts_log').insert(alertRows)

  return new Response(
    JSON.stringify({ logged: followers.length, pushed, fuels: fuelCodesBack }),
    { headers: { 'Content-Type': 'application/json' } },
  )
})
