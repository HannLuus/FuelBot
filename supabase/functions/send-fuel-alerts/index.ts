/**
 * Edge Function: send-fuel-alerts
 *
 * Called by a Supabase Database Webhook (or cron) when station_current_status changes.
 * For each station where a fuel type flipped from OUT → AVAILABLE, sends Web Push
 * notifications to all followers who have registered a push subscription.
 *
 * For now this logs the alert and records it in alerts_log.
 * Web Push delivery requires a VAPID key setup (wired up in Phase 5).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

  // Record alerts in alerts_log
  const alertRows = followers.map((f: { user_id: string }) => ({
    user_id: f.user_id,
    station_id: stationId,
    trigger: 'FUEL_BACK_IN_STOCK',
    channel: 'PUSH',
  }))

  await supabase.from('alerts_log').insert(alertRows)

  // TODO Phase 5: deliver Web Push via VAPID to registered push subscriptions
  // For now: logged above

  return new Response(
    JSON.stringify({ sent: followers.length, fuels: fuelCodesBack }),
    { headers: { 'Content-Type': 'application/json' } },
  )
})
