/**
 * Snapshot current status of all stations into station_status_snapshots for uptime calculation.
 * Intended to be run hourly via Supabase Dashboard Cron or external scheduler.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, json } from '../_shared/adminAuth.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders() })
  }

  // Require a pre-shared CRON_SECRET header to prevent unauthenticated snapshot spam.
  // Set CRON_SECRET as a Supabase Edge Function secret and include it in your scheduler's
  // x-cron-secret header. If the env var is unset the check is skipped (local dev only).
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (cronSecret) {
    const provided = req.headers.get('x-cron-secret')
    if (provided !== cronSecret) {
      return json({ error: 'Forbidden' }, 403)
    }
  }

  const service = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: statuses, error: fetchErr } = await service
    .from('station_current_status')
    .select('station_id, fuel_statuses_computed, source_role')

  if (fetchErr) {
    console.error('snapshot-station-statuses fetch error:', fetchErr)
    return json({ error: fetchErr.message }, 500)
  }

  if (!statuses?.length) {
    return json({ success: true, inserted: 0 })
  }

  const snapshotAt = new Date().toISOString()
  const rows = statuses.map((s: { station_id: string; fuel_statuses_computed: unknown; source_role: string | null }) => ({
    station_id: s.station_id,
    snapshot_at: snapshotAt,
    fuel_statuses_computed: s.fuel_statuses_computed ?? null,
    source_role: s.source_role ?? null,
  }))

  const { error: insertErr } = await service
    .from('station_status_snapshots')
    .insert(rows)

  if (insertErr) {
    console.error('snapshot-station-statuses insert error:', insertErr)
    return json({ error: insertErr.message }, 500)
  }

  return json({ success: true, inserted: rows.length })
})
